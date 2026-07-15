import { StateSchema } from "@langchain/langgraph";
import { z } from "zod/v4";

import { AGENT_IDS } from "@/lib/agents/registry";

export const LearningGraphState = new StateSchema({
  userMessage: z.string(),

  selectedAgent: z
    .enum(AGENT_IDS)
    .nullable()
    .default(null),

  routingReason: z.string().default(""),

  finalAnswer: z.string().default(""),
});

export type LearningGraphStateValue =
  typeof LearningGraphState.State;

export type LearningGraphStateUpdate =
  typeof LearningGraphState.Update;