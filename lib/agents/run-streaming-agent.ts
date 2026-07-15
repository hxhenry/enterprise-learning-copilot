import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";

import type { AgentId } from "@/lib/agents/registry";
import { getLearningModel } from "@/lib/ai/model";
import type { AgentEvent } from "@/lib/schemas/events";
import type { ConversationTurn } from "@/lib/agents/state";

type AgentEventReporter = (event: AgentEvent) => void;

type RunStreamingAgentOptions = {
  agentId: AgentId;
  agentName: string;
  systemPrompt: string;
  conversation: ConversationTurn[];
  tools: ToolSet;
  reportEvent: AgentEventReporter;
  abortSignal: AbortSignal;
};

export async function runStreamingAgent({
  agentId,
  agentName,
  systemPrompt,
  conversation,
  tools,
  reportEvent,
  abortSignal,
}: RunStreamingAgentOptions): Promise<string> {
  let providerError: unknown = null;

  reportEvent({
    type: "status",
    message: `${agentName} is processing your request...`,
  });

  const messages: ModelMessage[] = conversation.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const result = streamText({
    model: getLearningModel(),

    system: systemPrompt,

    prompt: messages,

    tools,

    stopWhen: stepCountIs(6),

    maxOutputTokens: 1_200,

    abortSignal,

    timeout: {
      totalMs: 90_000,
      stepMs: 30_000,
    },

    providerOptions: {
      openai: {
        store: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    },

    onStepFinish({ stepNumber, finishReason, toolCalls, toolResults, usage }) {
      console.info("Specialized agent step completed", {
        agentId,
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

      console.error("Specialized agent stream failed", {
        agentId,
        error,
      });
    },
  });

  let finalAnswer = "";

  for await (const textPart of result.textStream) {
    if (abortSignal.aborted) {
      break;
    }

    finalAnswer += textPart;

    reportEvent({
      type: "token",
      content: textPart,
    });
  }

  if (abortSignal.aborted) {
    return finalAnswer;
  }

  if (providerError) {
    throw providerError;
  }

  if (!finalAnswer.trim()) {
    throw new Error(`${agentName} returned no response text.`);
  }

  return finalAnswer;
}
