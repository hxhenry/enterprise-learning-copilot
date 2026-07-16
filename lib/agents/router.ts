import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

import {
  AGENT_IDS,
  getAgentCatalogForPrompt,
  type AgentId,
} from "@/lib/agents/registry";
import { getLearningModel } from "@/lib/ai/model";
import { buildRouterSystemPrompt } from "@/lib/prompts/learning-copilot";
import type { ConversationTurn } from "@/lib/agents/state";

const RouterDecisionSchema = z.object({
  agentId: z.enum(AGENT_IDS),

  requestKind: z.enum(["answer", "enrollment"]),

  reason: z
    .string()
    .min(1)
    .max(200)
    .describe("A short user-safe reason for selecting this route."),
});

export type RouterDecision = {
  agentId: AgentId;
  requestKind: "answer" | "enrollment";
  reason: string;
};

export async function routeLearningRequest(
  userMessage: string,
  conversation: ConversationTurn[],
  abortSignal: AbortSignal,
  model: LanguageModel = getLearningModel(),
): Promise<RouterDecision> {
  const previousConversation = conversation
    .slice(0, -1)
    .slice(-6)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join("\n");

  const { output } = await generateText({
    model,

    system: buildRouterSystemPrompt(getAgentCatalogForPrompt()),

    prompt: `
Recent conversation:
${previousConversation || "No previous conversation."}

Current user request:
${userMessage}
`,

    output: Output.object({
      name: "LearningAgentRoute",
      description:
        "The specialized learning-platform route selected for the request.",
      schema: RouterDecisionSchema,
    }),

    maxOutputTokens: 250,

    abortSignal,

    timeout: {
      totalMs: 30_000,
      stepMs: 25_000,
    },

    providerOptions: {
      openai: {
        store: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  return output;
}
