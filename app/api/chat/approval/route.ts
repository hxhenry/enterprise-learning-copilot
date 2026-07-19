import { Command, isInterrupted } from "@langchain/langgraph";

import { createLearningGraph } from "@/lib/agents/graph";
import { KeyedSerialExecutor } from "@/lib/concurrency/keyed-serial-executor";
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
import { encodeAgentEvent } from "@/lib/streaming/agent-event-stream";

export const runtime = "nodejs";

/*
 * Prevent two requests from resuming the same action concurrently in this
 * process. Durable adapters must still enforce idempotency across replicas.
 */
const approvalExecutions = new KeyedSerialExecutor();

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

      try {
        reportEvent({
          type: "status",
          message: approved
            ? "Applying your approval..."
            : "Cancelling the requested action...",
        });

        const approvalKey = JSON.stringify([threadId, actionId]);

        await approvalExecutions.run(approvalKey, async () => {
          if (request.signal.aborted) {
            return;
          }

          /*
           * Hold graph events until terminal state is validated. Otherwise the
           * client could observe a successful write before this route discovers
           * an inconsistent checkpoint result.
           */
          const bufferedEvents: AgentEventPayload[] = [];
          let resolutionReported = false;

          const reportGraphEvent: AgentEventReporter = (event) => {
            if (event.type === "approval-resolved") {
              if (
                event.actionId !== actionId ||
                event.approved !== approved
              ) {
                throw new Error(
                  "The workflow resolved a different approval action.",
                );
              }

              resolutionReported = true;
            }

            bufferedEvents.push(event);
          };

          const graph = createLearningGraph({
            reportEvent: reportGraphEvent,
            abortSignal: request.signal,
            actor,
            runContext,
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
                thread_id: threadId,
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

          const expectedStatus = approved ? "approved" : "rejected";

          if (
            !result.finalAnswer.trim() ||
            result.approvalStatus !== expectedStatus ||
            result.resolvedEnrollmentActionId !== actionId ||
            result.pendingEnrollment !== null
          ) {
            throw new Error(
              "The approval workflow returned an inconsistent result.",
            );
          }

          if (!resolutionReported) {
            bufferedEvents.push({
              type: "approval-resolved",
              actionId,
              approved,
              message: result.finalAnswer,
            });
          }

          for (const event of bufferedEvents) {
            reportEvent(event);
          }
        });

        if (request.signal.aborted) {
          return;
        }

        reportEvent({
          type: "done",
        });

        logInfo("http.request.completed", runContext, {
          route: "/api/chat/approval",
          outcome: approved ? "approved" : "rejected",
          actionId,
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        if (!request.signal.aborted) {
          logError("http.request.failed", runContext, error, {
            route: "/api/chat/approval",
            actionId,
            durationMs: Math.round(performance.now() - startedAt),
          });

          reportEvent({
            type: "error",
            code: "APPROVAL_EXECUTION_FAILED",
            message: "The approval decision could not be applied.",
            retryable: false,
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
