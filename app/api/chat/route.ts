import { createLearningGraph } from "@/lib/agents/graph";
import type { AgentEvent } from "@/lib/schemas/events";

export const runtime = "nodejs";

type ChatRequest = {
  message?: unknown;
};

const encoder = new TextEncoder();

function encodeEvent(event: AgentEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

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

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      {
        error: "The server is missing its OpenAI API configuration.",
      },
      {
        status: 500,
      },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (event: AgentEvent): boolean => {
        if (isClosed || request.signal.aborted) {
          return false;
        }

        try {
          controller.enqueue(encodeEvent(event));
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
          // The browser may already have cancelled the stream.
        }
      };

      try {
        sendEvent({
          type: "status",
          message: "Starting the LangGraph workflow...",
        });

        const graph = createLearningGraph({
          reportEvent(event) {
            sendEvent(event);
          },
          abortSignal: request.signal,
        });

        const result = await graph.invoke(
          {
            userMessage: message,
          },
          {
            recursionLimit: 8,
          },
        );

        if (request.signal.aborted) {
          return;
        }

        if (!result.finalAnswer.trim()) {
          throw new Error("The selected agent returned no final answer.");
        }

        sendEvent({
          type: "done",
        });
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("Learning model request failed:", error);

          sendEvent({
            type: "error",
            message:
              "The learning model could not complete the request. Check the server logs and API configuration.",
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
    },
  });
}
