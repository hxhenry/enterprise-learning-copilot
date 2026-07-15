import {
  END,
  START,
  StateGraph,
  type ConditionalEdgeRouter,
} from "@langchain/langgraph";

import {
  AGENT_REGISTRY,
  type AgentId,
} from "@/lib/agents/registry";
import { routeLearningRequest } from "@/lib/agents/router";
import { runStreamingAgent } from "@/lib/agents/run-streaming-agent";
import { LearningGraphState } from "@/lib/agents/state";
import {
  ANALYTICS_AGENT_PROMPT,
  CERTIFICATION_AGENT_PROMPT,
  TUTOR_AGENT_PROMPT,
} from "@/lib/prompts/learning-copilot";
import type { AgentEvent } from "@/lib/schemas/events";
import { createAnalyticsTools } from "@/lib/tools/analytics-tools";
import { createCertificationTools } from "@/lib/tools/certification-tools";
import { createRagTools } from "@/lib/tools/rag-tools";

type AgentEventReporter = (event: AgentEvent) => void;

type CreateLearningGraphOptions = {
  reportEvent: AgentEventReporter;
  abortSignal: AbortSignal;
};

export function createLearningGraph({
  reportEvent,
  abortSignal,
}: CreateLearningGraphOptions) {
  const routerNode: typeof LearningGraphState.Node =
    async (state) => {
      reportEvent({
        type: "status",
        message: "Selecting the best specialized agent...",
      });

      const decision = await routeLearningRequest(
        state.userMessage,
        abortSignal,
      );

      const selectedDefinition =
        AGENT_REGISTRY[decision.agentId];

      reportEvent({
        type: "agent-selected",
        agentId: selectedDefinition.id,
        agentName: selectedDefinition.name,
        reason: decision.reason,
      });

      return {
        selectedAgent: decision.agentId,
        routingReason: decision.reason,
      };
    };

  const tutorNode: typeof LearningGraphState.Node =
    async (state) => {
      const answer = await runStreamingAgent({
        agentId: "tutor",
        agentName: AGENT_REGISTRY.tutor.name,
        systemPrompt: TUTOR_AGENT_PROMPT,
        userMessage: state.userMessage,
        tools: {
          ...createRagTools(reportEvent),
        },
        reportEvent,
        abortSignal,
      });

      return {
        finalAnswer: answer,
      };
    };

  const certificationNode: typeof LearningGraphState.Node =
    async (state) => {
      const answer = await runStreamingAgent({
        agentId: "certification",
        agentName: AGENT_REGISTRY.certification.name,
        systemPrompt: CERTIFICATION_AGENT_PROMPT,
        userMessage: state.userMessage,
        tools: {
          ...createCertificationTools(reportEvent),
          ...createRagTools(reportEvent),
        },
        reportEvent,
        abortSignal,
      });

      return {
        finalAnswer: answer,
      };
    };

  const analyticsNode: typeof LearningGraphState.Node =
    async (state) => {
      const answer = await runStreamingAgent({
        agentId: "analytics",
        agentName: AGENT_REGISTRY.analytics.name,
        systemPrompt: ANALYTICS_AGENT_PROMPT,
        userMessage: state.userMessage,
        tools: {
          ...createAnalyticsTools(reportEvent),
        },
        reportEvent,
        abortSignal,
      });

      return {
        finalAnswer: answer,
      };
    };

  const routeToSelectedAgent: ConditionalEdgeRouter<
    typeof LearningGraphState,
    Record<string, unknown>,
    AgentId
  > = (state) => {
    if (!state.selectedAgent) {
      throw new Error(
        "The router did not select an agent.",
      );
    }

    return state.selectedAgent;
  };

  return new StateGraph(LearningGraphState)
    .addNode("router", routerNode)
    .addNode("tutor", tutorNode)
    .addNode("certification", certificationNode)
    .addNode("analytics", analyticsNode)

    .addEdge(START, "router")

    .addConditionalEdges(
      "router",
      routeToSelectedAgent,
      {
        tutor: "tutor",
        certification: "certification",
        analytics: "analytics",
      },
    )

    .addEdge("tutor", END)
    .addEdge("certification", END)
    .addEdge("analytics", END)

    .compile();
}