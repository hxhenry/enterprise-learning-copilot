import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { stepCountIs, streamText } from "ai";

import { getLearningModel } from "@/lib/ai/model";
import { LEARNING_COPILOT_SYSTEM_PROMPT } from "@/lib/prompts/learning-copilot";
import type { AgentEvent } from "@/lib/schemas/events";
import { createCertificationTools } from "@/lib/tools/certification-tools";
import { createRagTools } from "@/lib/tools/rag-tools";

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
      let providerError: unknown = null;

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
          message: "Connecting to the learning model...",
        });

        const reportEvent = (event: AgentEvent) => {
          sendEvent(event);
        };

        const tools = {
          ...createCertificationTools(reportEvent),
          ...createRagTools(reportEvent),
        };

        const result = streamText({
          model: getLearningModel(),

          system: LEARNING_COPILOT_SYSTEM_PROMPT,

          prompt: message,

          tools,

          stopWhen: stepCountIs(6),

          maxOutputTokens: 900,

          abortSignal: request.signal,

          timeout: {
            totalMs: 90_000,
            chunkMs: 30_000,
          },

          providerOptions: {
            openai: {
              store: false,
            } satisfies OpenAILanguageModelResponsesOptions,
          },

          onStepFinish({
            stepNumber,
            finishReason,
            toolCalls,
            toolResults,
            usage,
          }) {
            console.info("Learning agent step completed", {
              stepNumber,
              finishReason,
              toolNames: toolCalls.map((toolCall) => toolCall.toolName),
              toolResultCount: toolResults.length,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            });
          },

          onError({ error }) {
            providerError = error;

            console.error("AI SDK streaming error:", error);
          },
        });

        sendEvent({
          type: "status",
          message: "Generating a response...",
        });

        let receivedText = false;

        for await (const textPart of result.textStream) {
          if (request.signal.aborted) {
            break;
          }

          receivedText = true;

          const sent = sendEvent({
            type: "token",
            content: textPart,
          });

          if (!sent) {
            break;
          }
        }

        if (request.signal.aborted) {
          return;
        }

        if (providerError) {
          throw providerError;
        }

        if (!receivedText) {
          throw new Error("The model returned no text.");
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
