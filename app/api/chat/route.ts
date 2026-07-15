import type { AgentEvent } from "@/lib/schemas/events";

type ChatRequest = {
  message?: unknown;
};

const encoder = new TextEncoder();

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function encodeEvent(event: AgentEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function createMockResponse(userMessage: string): string {
  return [
    `I received your request: "${userMessage}".`,
    "",
    "This response is currently coming from our mock agent workflow.",
    "In the next milestone, a LangGraph router will select a specialized",
    "Tutor Agent, Certification Agent, or Business Analytics Agent.",
  ].join(" ");
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

  const message =
    typeof body.message === "string" ? body.message.trim() : "";

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: AgentEvent) => {
        if (!request.signal.aborted) {
          controller.enqueue(encodeEvent(event));
        }
      };

      try {
        sendEvent({
          type: "status",
          message: "Understanding your request...",
        });

        await sleep(500);

        sendEvent({
          type: "status",
          message: "Selecting the correct agent...",
        });

        await sleep(500);

        sendEvent({
          type: "status",
          message: "Generating response...",
        });

        const responseText = createMockResponse(message);
        const responseChunks = responseText.split(/(\s+)/).filter(Boolean);

        for (const chunk of responseChunks) {
          if (request.signal.aborted) {
            break;
          }

          sendEvent({
            type: "token",
            content: chunk,
          });

          await sleep(35);
        }

        if (!request.signal.aborted) {
          sendEvent({
            type: "done",
          });
        }
      } catch (error) {
        if (!request.signal.aborted) {
          sendEvent({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "An unexpected streaming error occurred.",
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The browser may have already cancelled the stream.
        }
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