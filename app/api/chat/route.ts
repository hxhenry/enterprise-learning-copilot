import { INTERRUPT, isInterrupted } from "@langchain/langgraph";

import { createLearningGraph } from "@/lib/agents/graph";
import { isApprovalRequest, type AgentEvent } from "@/lib/schemas/events";
import { getAuthenticatedActor } from "@/lib/security/authorization";
import { parseSafeIdentifier } from "@/lib/security/request-validation";
import { performance } from "node:perf_hooks";
import { createObservedEventReporter } from "@/lib/observability/event-reporter";
import { logError, logInfo } from "@/lib/observability/logger";
import { createRunContext } from "@/lib/observability/run-context";
import { encodeAgentEvent } from "@/lib/streaming/agent-event-stream";
import {
  getServerEnvironment,
  ServerEnvironmentError,
} from "@/lib/config/server-environment";

export const runtime = "nodejs";

type ChatRequest = {
  message?: unknown;
  threadId?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
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

  const message = typeof body.message === "string" ? body.message.trim() : "";

  const threadId = parseSafeIdentifier(body.threadId);

  if (!message) {
    return Response.json(
      {
        error: "Message is required.",
      },
      {
        status: 400,
      },
    );
  }

  if (!threadId) {
    return Response.json(
      {
        error: "A valid conversation thread ID is required.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    getServerEnvironment();
  } catch (error) {
    if (!(error instanceof ServerEnvironmentError)) {
      throw error;
    }

    return Response.json(
      {
        code: "SERVER_CONFIGURATION_ERROR",
        error: "The server is missing its OpenAI API configuration.",
      },
      {
        status: 500,
      },
    );
  }

  const actor = getAuthenticatedActor();
  const runContext = createRunContext({
    threadId,
    operation: "chat",
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
          // The browser may have cancelled.
        }
      };

      const startedAt = performance.now();

      const reportEvent = createObservedEventReporter({
        context: runContext,
        emit: sendEvent,
      });

      logInfo("http.request.started", runContext, {
        route: "/api/chat",
        method: "POST",
      });

      try {
        reportEvent({
          type: "status",
          message: "Starting the persistent LangGraph workflow...",
        });

        const graph = createLearningGraph({
          reportEvent,
          abortSignal: request.signal,
          actor,
          runContext,
        });

        const result = await graph.invoke(
          {
            userMessage: message,

            conversation: [
              {
                role: "user",
                content: message,
              },
            ],

            selectedAgent: null,
            routingReason: "",
            requestKind: "answer",
            pendingEnrollment: null,
            resolvedEnrollmentActionId: null,
            approvalStatus: "not-required",
            finalAnswer: "",
          },
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
          /*
           * `done` terminates this HTTP stream only. LangGraph keeps the thread
           * checkpoint paused so the approval route can resume the same action.
           */
          const pendingInterrupt = result[INTERRUPT][0];
          const approvalRequest = pendingInterrupt?.value;

          if (!isApprovalRequest(approvalRequest)) {
            throw new Error("The workflow returned an unsupported interrupt.");
          }

          reportEvent({
            type: "approval-required",
            request: approvalRequest,
          });

          reportEvent({
            type: "done",
          });

          logInfo("http.request.completed", runContext, {
            route: "/api/chat",
            outcome: "interrupted",
            durationMs: Math.round(performance.now() - startedAt),
          });

          return;
        }

        if (!result.finalAnswer.trim()) {
          throw new Error("The selected workflow returned no final answer.");
        }

        reportEvent({
          type: "done",
        });

        logInfo("http.request.completed", runContext, {
          route: "/api/chat",
          outcome: "completed",
          durationMs: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        if (!request.signal.aborted) {
          logError("http.request.failed", runContext, error, {
            route: "/api/chat",
            durationMs: Math.round(performance.now() - startedAt),
          });

          reportEvent({
            type: "error",
            code: "WORKFLOW_EXECUTION_FAILED",
            message: "The learning workflow could not complete the request.",
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
