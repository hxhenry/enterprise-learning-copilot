import type {
  OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  AGENT_IDS,
  getAgentCatalogForPrompt,
  type AgentId,
} from "@/lib/agents/registry";
import { getLearningModel } from "@/lib/ai/model";
import { buildRouterSystemPrompt } from "@/lib/prompts/learning-copilot";

const RouterDecisionSchema = z.object({
  agentId: z.enum(AGENT_IDS),

  reason: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "A short user-safe reason for selecting this agent.",
    ),
});

export type RouterDecision = {
  agentId: AgentId;
  reason: string;
};

export async function routeLearningRequest(
  userMessage: string,
  abortSignal: AbortSignal,
): Promise<RouterDecision> {
  const { output } = await generateText({
    model: getLearningModel(),

    system: buildRouterSystemPrompt(
      getAgentCatalogForPrompt(),
    ),

    prompt: userMessage,

    output: Output.object({
      name: "LearningAgentRoute",
      description:
        "The specialized learning-platform agent selected for the request.",
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