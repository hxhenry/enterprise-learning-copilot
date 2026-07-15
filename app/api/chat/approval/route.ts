import {
  Command,
  isInterrupted,
} from "@langchain/langgraph";

import { createLearningGraph } from "@/lib/agents/graph";
import type { AgentEvent } from "@/lib/schemas/events";
import { getAuthenticatedActor } from "@/lib/security/authorization";
import { parseSafeIdentifier } from "@/lib/security/request-validation";

export const runtime = "nodejs";

type ApprovalBody = {
  threadId?: unknown;
  actionId?: unknown;
  approved?: unknown;
};

const encoder = new TextEncoder();

function encodeEvent(
  event: AgentEvent,
): Uint8Array {
  return encoder.encode(
    `data: ${JSON.stringify(event)}\n\n`,
  );
}

export async function POST(
  request: Request,
): Promise<Response> {
  let body: ApprovalBody;

  try {
    body =
      (await request.json()) as ApprovalBody;
  } catch {
    return Response.json(
      {
        error:
          "The request body must be valid JSON.",
      },
      {
        status: 400,
      },
    );
  }

  const threadId =
    parseSafeIdentifier(body.threadId);

  const actionId =
    parseSafeIdentifier(body.actionId);

  const approved =
    typeof body.approved === "boolean"
      ? body.approved
      : null;

  if (
    !threadId ||
    !actionId ||
    approved === null
  ) {
    return Response.json(
      {
        error:
          "A valid thread, action, and approval decision are required.",
      },
      {
        status: 400,
      },
    );
  }

  const actor = getAuthenticatedActor();

  const stream =
    new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;

        const sendEvent = (
          event: AgentEvent,
        ) => {
          if (
            isClosed ||
            request.signal.aborted
          ) {
            return;
          }

          try {
            controller.enqueue(
              encodeEvent(event),
            );
          } catch {
            isClosed = true;
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

        try {
          sendEvent({
            type: "status",
            message: approved
              ? "Applying your approval..."
              : "Cancelling the requested action...",
          });

          const graph =
            createLearningGraph({
              reportEvent(event) {
                sendEvent(event);
              },
              abortSignal:
                request.signal,
              actor,
            });

          const result =
            await graph.invoke(
              new Command({
                resume: {
                  actionId,
                  approved,
                  decidedBy:
                    actor.userId,
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

          sendEvent({
            type: "done",
          });
        } catch (error) {
          if (!request.signal.aborted) {
            console.error(
              "Approval workflow failed:",
              error,
            );

            sendEvent({
              type: "error",
              message:
                "The approval decision could not be applied.",
            });
          }
        } finally {
          closeStream();
        }
      },
    });

  return new Response(stream, {
    headers: {
      "Content-Type":
        "text/event-stream; charset=utf-8",
      "Cache-Control":
        "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}