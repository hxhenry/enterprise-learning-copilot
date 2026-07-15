import { performance } from "node:perf_hooks";

import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { stepCountIs, streamText, type ModelMessage, type ToolSet } from "ai";

import type { AgentId } from "@/lib/agents/registry";
import type { ConversationTurn } from "@/lib/agents/state";
import { getLearningModel } from "@/lib/ai/model";
import { logError, logInfo } from "@/lib/observability/logger";
import type { RunContext } from "@/lib/observability/run-context";
import type { AgentEvent } from "@/lib/schemas/events";

type AgentEventReporter = (event: AgentEvent) => void;

type RunStreamingAgentOptions = {
  agentId: AgentId;
  agentName: string;
  systemPrompt: string;
  conversation: ConversationTurn[];
  tools: ToolSet;
  reportEvent: AgentEventReporter;
  abortSignal: AbortSignal;
  runContext: RunContext;
};

export async function runStreamingAgent({
  agentId,
  agentName,
  systemPrompt,
  conversation,
  tools,
  reportEvent,
  abortSignal,
  runContext,
}: RunStreamingAgentOptions): Promise<string> {
  let providerError: unknown = null;
  let completedStepCount = 0;
  let receivedFirstToken = false;

  const startedAt = performance.now();

  logInfo("agent.run.started", runContext, {
    agentId,
    agentName,
    conversationTurnCount: conversation.length,
    availableTools: Object.keys(tools),
  });

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

    onStepFinish({ finishReason, toolCalls, toolResults, usage }) {
      completedStepCount += 1;

      logInfo("agent.step.completed", runContext, {
        agentId,
        stepNumber: completedStepCount,
        finishReason,
        toolNames: toolCalls.map((toolCall) => toolCall.toolName),
        toolResultCount: toolResults.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    },
    onFinish({ finishReason, totalUsage }) {
      logInfo("agent.model.completed", runContext, {
        agentId,
        finishReason,
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        totalTokens: totalUsage.totalTokens,
      });
    },

    onError({ error }) {
      providerError = error;

      logError("agent.model.failed", runContext, error, {
        agentId,
      });
    },
  });

  let finalAnswer = "";

  for await (const textPart of result.textStream) {
    if (abortSignal.aborted) {
      break;
    }

    if (!receivedFirstToken) {
      receivedFirstToken = true;

      logInfo("agent.first_token.received", runContext, {
        agentId,
        timeToFirstTokenMs: Math.round(performance.now() - startedAt),
      });
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

  logInfo("agent.run.completed", runContext, {
    agentId,
    durationMs: Math.round(performance.now() - startedAt),
    outputCharacterCount: finalAnswer.length,
  });

  return finalAnswer;
}
