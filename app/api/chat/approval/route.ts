import { Command, isInterrupted } from "@langchain/langgraph";

import { createLearningGraph } from "@/lib/agents/graph";
import type {
  AgentEvent,
  AgentEventPayload,
  AgentEventReporter,
} from "@/lib/schemas/events";
import { getAuthenticatedActor } from "@/lib/security/authorization";
import { parseSafeIdentifier } from "@/lib/security/request-validation";

import { performance } from "node:perf_hooks";

import { createObservedEventReporter } from "@/lib/observability/event-reporter";
import { logError, logInfo } from "@/lib/observability/logger";
import { createRunContext } from "@/lib/observability/run-context";
import {
  isPersistenceError,
  isRetryablePersistenceError,
} from "@/lib/database/persistence-error";
import { getLearningRuntime } from "@/lib/runtime/learning-runtime";
import {
  createCheckpointThreadId,
  createWorkflowLockKey,
} from "@/lib/security/checkpoint-thread";
import { encodeAgentEvent } from "@/lib/streaming/agent-event-stream";

export const runtime = "nodejs";

type ApprovalBody = {
  threadId?: unknown;
  actionId?: unknown;
  approved?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let body: ApprovalBody;

  try {
    body = (await request.json()) as ApprovalBody;
  } catch {
    return Response.json(
      {
        error: "The request body must be valid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  const threadId = parseSafeIdentifier(body.threadId);

  const actionId = parseSafeIdentifier(body.actionId);

  const approved = typeof body.approved === "boolean" ? body.approved : null;

  if (!threadId || !actionId || approved === null) {
    return Response.json(
      {
        error: "A valid thread, action, and approval decision are required.",
      },
      {
        status: 400,
      },
    );
  }

  const actor = getAuthenticatedActor();

  const runContext = createRunContext({
    threadId,
    operation: "approval",
  });
  const checkpointThreadId = createCheckpointThreadId(
    actor.userId,
    threadId,
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (event: AgentEvent): boolean => {
        if (isClosed || request.signal.aborted) {
          return false;
        }

        try {
          controller.enqueue(encodeAgentEvent(event));
          return true;
        } catch {
          isClosed = true;
          return false;
        }
      };

      const closeStream = () => {
        if (isClosed) {
          return;
        }

        isClosed = true;

        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      const startedAt = performance.now();

      const reportEvent = createObservedEventReporter({
        context: runContext,
        emit: sendEvent,
      });

      logInfo("http.request.started", runContext, {
        route: "/api/chat/approval",
        method: "POST",
        actionId,
        approved,
      });

      let resolvedApproved: boolean | undefined;

      try {
        reportEvent({
          type: "status",
          message: approved
            ? "Applying your approval..."
            : "Cancelling the requested action...",
        });

        const learningRuntime = await getLearningRuntime();
        const bufferedEvents: AgentEventPayload[] = [];
        let reportedResolution:
          | Extract<AgentEventPayload, { type: "approval-resolved" }>
          | undefined;

        await learningRuntime.workflowCoordinator.run(
          createWorkflowLockKey(checkpointThreadId),
          async () => {
            if (request.signal.aborted) {
              return;
            }

            const reportGraphEvent: AgentEventReporter = (event) => {
              if (event.type === "approval-resolved") {
                if (event.actionId !== actionId) {
                  throw new Error(
                    "The workflow resolved a different approval action.",
                  );
                }

                if (
                  reportedResolution &&
                  (reportedResolution.approved !== event.approved ||
                    reportedResolution.message !== event.message)
                ) {
                  throw new Error(
                    "The workflow reported conflicting approval results.",
                  );
                }

                reportedResolution = event;
              }

              bufferedEvents.push(event);
            };

            const graph = createLearningGraph({
              reportEvent: reportGraphEvent,
              abortSignal: request.signal,
              actor,
              runContext,
              dependencies: {
                checkpointer: learningRuntime.checkpointer,
                repositories: learningRuntime.repositories,
              },
            });

            const result = await graph.invoke(
              new Command({
                resume: {
                  actionId,
                  approved,
                  decidedBy: actor.userId,
                  reason: approved
                    ? "Approved by the user."
                    : "Rejected by the user.",
                },
              }),
              {
                configurable: {
                  thread_id: checkpointThreadId,
                },
                recursionLimit: 12,
              },
            );

            if (request.signal.aborted) {
              return;
            }

            if (isInterrupted(result)) {
              throw new Error(
                "The approval workflow did not resume correctly.",
              );
            }

            const canonicalApproved =
              result.approvalStatus === "approved"
                ? true
                : result.approvalStatus === "rejected"
                  ? false
                  : null;

            if (
              !result.finalAnswer.trim() ||
              canonicalApproved === null ||
              result.resolvedEnrollmentActionId !== actionId ||
              result.pendingEnrollment !== null
            ) {
              throw new Error(
                "The approval workflow returned an inconsistent result.",
              );
            }

            if (
              reportedResolution &&
              (reportedResolution.approved !== canonicalApproved ||
                reportedResolution.message !== result.finalAnswer)
            ) {
              throw new Error(
                "The workflow event did not match its terminal approval state.",
              );
            }

            if (!reportedResolution) {
              bufferedEvents.push({
                type: "approval-resolved",
                actionId,
                approved: canonicalApproved,
                message: result.finalAnswer,
              });
            }

            resolvedApproved = canonicalApproved;
          },
          {
            signal: request.signal,
          },
        );

        if (request.signal.aborted) {
          return;
        }

        for (const event of bufferedEvents) {
          reportEvent(event);
        }

        reportEvent({
          type: "done",
        });

        logInfo("http.request.completed", runContext, {
          route: "/api/chat/approval",
          outcome: resolvedApproved ? "approved" : "rejected",
          actionId,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        if (!request.signal.aborted) {
          const persistenceUnavailable =
            isPersistenceError(error);
          const retryable = isRetryablePersistenceError(error);

          logError("http.request.failed", runContext, error, {
            route: "/api/chat/approval",
            actionId,
            durationMs: Math.round(performance.now() - startedAt),
          });

          reportEvent({
            type: "error",
            code: persistenceUnavailable
              ? "PERSISTENCE_UNAVAILABLE"
              : "APPROVAL_EXECUTION_FAILED",
            message: persistenceUnavailable
              ? retryable
                ? "Durable persistence is temporarily unavailable. Please retry."
                : "Durable persistence is unavailable."
              : "The approval decision could not be applied.",
            retryable,
          });
        }
      } finally {
        closeStream();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": runContext.requestId,
    },
  });
}
