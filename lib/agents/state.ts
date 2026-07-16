import {
  ReducedValue,
  StateSchema,
} from "@langchain/langgraph";
import { z } from "zod/v4";

import { AGENT_IDS } from "@/lib/agents/registry";

export const ConversationTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ConversationTurn = z.infer<
  typeof ConversationTurnSchema
>;

export const PendingEnrollmentSchema = z.object({
  actionId: z.string(),
  userId: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  requestedAt: z.string(),
});

export type PendingEnrollment = z.infer<
  typeof PendingEnrollmentSchema
>;

export const LearningGraphState = new StateSchema({
  userMessage: z.string().default(""),

  conversation: new ReducedValue(
    z
      .array(ConversationTurnSchema)
      .default(() => []),
    {
      reducer: (
        currentConversation,
        newTurns,
      ) =>
        [
          ...currentConversation,
          ...newTurns,
        ].slice(-12),
    },
  ),

  selectedAgent: z
    .enum(AGENT_IDS)
    .nullable()
    .default(null),

  routingReason: z.string().default(""),

  requestKind: z
    .enum(["answer", "enrollment"])
    .default("answer"),

  pendingEnrollment: PendingEnrollmentSchema
    .nullable()
    .default(null),

  resolvedEnrollmentActionId: z
    .string()
    .nullable()
    .default(null),

  approvalStatus: z
    .enum([
      "not-required",
      "pending",
      "approved",
      "rejected",
    ])
    .default("not-required"),

  finalAnswer: z.string().default(""),
});

export type LearningGraphStateValue =
  typeof LearningGraphState.State;

export type LearningGraphStateUpdate =
  typeof LearningGraphState.Update;
