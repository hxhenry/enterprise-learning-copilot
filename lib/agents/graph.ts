import { randomUUID } from "node:crypto";

import {
  END,
  START,
  StateGraph,
  interrupt,
  type ConditionalEdgeRouter,
} from "@langchain/langgraph";

import {
  completedCourseIdsByUser,
  findCourse,
  getNextRequiredCourse,
} from "@/data/mock-learning-data";
import { createCourseEnrollment } from "@/data/mock-enrollment-data";
import { learningGraphCheckpointer } from "@/lib/agents/checkpointer";
import { AGENT_REGISTRY, type AgentId } from "@/lib/agents/registry";
import { routeLearningRequest } from "@/lib/agents/router";
import { runStreamingAgent } from "@/lib/agents/run-streaming-agent";
import {
  LearningGraphState,
  type LearningGraphStateValue,
} from "@/lib/agents/state";
import {
  ANALYTICS_AGENT_PROMPT,
  CERTIFICATION_AGENT_PROMPT,
  TUTOR_AGENT_PROMPT,
} from "@/lib/prompts/learning-copilot";
import type { AgentEvent, ApprovalRequest } from "@/lib/schemas/events";
import {
  assertPermission,
  type AuthenticatedActor,
} from "@/lib/security/authorization";
import { createAnalyticsTools } from "@/lib/tools/analytics-tools";
import { createCertificationTools } from "@/lib/tools/certification-tools";
import { createRagTools } from "@/lib/tools/rag-tools";

type AgentEventReporter = (event: AgentEvent) => void;

type CreateLearningGraphOptions = {
  reportEvent: AgentEventReporter;
  abortSignal: AbortSignal;
  actor: AuthenticatedActor;
};

type RouterDestination = AgentId | "prepareEnrollment";

type ApprovalResume = {
  actionId: string;
  approved: boolean;
  decidedBy: string;
  reason?: string;
};

function isApprovalResume(value: unknown): value is ApprovalResume {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const decision = value as Record<string, unknown>;

  return (
    typeof decision.actionId === "string" &&
    typeof decision.approved === "boolean" &&
    typeof decision.decidedBy === "string" &&
    (decision.reason === undefined || typeof decision.reason === "string")
  );
}

function resolveRequestedCourse(
  state: LearningGraphStateValue,
  actor: AuthenticatedActor,
) {
  const normalizedMessage = state.userMessage.toLowerCase();

  const requestsNextCourse =
    /\bnext(?:\s+(?:required|recommended))?\s+course\b/.test(normalizedMessage);

  if (requestsNextCourse) {
    return getNextRequiredCourse(actor.userId, "cert-cloud-security");
  }

  const directMatch = findCourse(state.userMessage);

  if (directMatch) {
    return directMatch;
  }

  const recentContext = state.conversation
    .slice(-6)
    .map((turn) => turn.content)
    .join("\n");

  return findCourse(recentContext);
}

export function createLearningGraph({
  reportEvent,
  abortSignal,
  actor,
}: CreateLearningGraphOptions) {
  const routerNode: typeof LearningGraphState.Node = async (state) => {
    reportEvent({
      type: "status",
      message: "Selecting the best specialized agent...",
    });

    const decision = await routeLearningRequest(
      state.userMessage,
      state.conversation,
      abortSignal,
    );

    const selectedDefinition = AGENT_REGISTRY[decision.agentId];

    reportEvent({
      type: "agent-selected",
      agentId: selectedDefinition.id,
      agentName: selectedDefinition.name,
      reason: decision.reason,
    });

    return {
      selectedAgent: decision.agentId,
      requestKind: decision.requestKind,
      routingReason: decision.reason,
    };
  };

  const tutorNode: typeof LearningGraphState.Node = async (state) => {
    const answer = await runStreamingAgent({
      agentId: "tutor",
      agentName: AGENT_REGISTRY.tutor.name,
      systemPrompt: TUTOR_AGENT_PROMPT,
      conversation: state.conversation,
      tools: {
        ...createRagTools(reportEvent),
      },
      reportEvent,
      abortSignal,
    });

    return {
      finalAnswer: answer,
      conversation: [
        {
          role: "assistant",
          content: answer,
        },
      ],
    };
  };

  const certificationNode: typeof LearningGraphState.Node = async (state) => {
    const answer = await runStreamingAgent({
      agentId: "certification",
      agentName: AGENT_REGISTRY.certification.name,
      systemPrompt: CERTIFICATION_AGENT_PROMPT,
      conversation: state.conversation,
      tools: {
        ...createCertificationTools(reportEvent),
        ...createRagTools(reportEvent),
      },
      reportEvent,
      abortSignal,
    });

    return {
      finalAnswer: answer,
      conversation: [
        {
          role: "assistant",
          content: answer,
        },
      ],
    };
  };

  const analyticsNode: typeof LearningGraphState.Node = async (state) => {
    const answer = await runStreamingAgent({
      agentId: "analytics",
      agentName: AGENT_REGISTRY.analytics.name,
      systemPrompt: ANALYTICS_AGENT_PROMPT,
      conversation: state.conversation,
      tools: {
        ...createAnalyticsTools(reportEvent),
      },
      reportEvent,
      abortSignal,
    });

    return {
      finalAnswer: answer,
      conversation: [
        {
          role: "assistant",
          content: answer,
        },
      ],
    };
  };

  const prepareEnrollmentNode: typeof LearningGraphState.Node = async (
    state,
  ) => {
    assertPermission(actor, "enrollment:request");

    const course = resolveRequestedCourse(state, actor);

    if (!course) {
      const answer =
        "I could not identify which course you want to enroll in. Please provide the exact course title.";

      reportEvent({
        type: "token",
        content: answer,
      });

      return {
        finalAnswer: answer,
        approvalStatus: "rejected",
        pendingEnrollment: null,
        conversation: [
          {
            role: "assistant",
            content: answer,
          },
        ],
      };
    }

    const completedCourses = new Set(
      completedCourseIdsByUser[actor.userId] ?? [],
    );

    if (completedCourses.has(course.id)) {
      const answer = `You already completed ${course.title}, so a new enrollment request is not necessary.`;

      reportEvent({
        type: "token",
        content: answer,
      });

      return {
        finalAnswer: answer,
        approvalStatus: "rejected",
        pendingEnrollment: null,
        conversation: [
          {
            role: "assistant",
            content: answer,
          },
        ],
      };
    }

    return {
      approvalStatus: "pending",
      pendingEnrollment: {
        actionId: randomUUID(),
        userId: actor.userId,
        courseId: course.id,
        courseTitle: course.title,
        requestedAt: new Date().toISOString(),
      },
    };
  };

  const approvalNode: typeof LearningGraphState.Node = async (state) => {
    const pending = state.pendingEnrollment;

    if (!pending) {
      throw new Error("No enrollment action is waiting for approval.");
    }

    const approvalRequest: ApprovalRequest = {
      actionId: pending.actionId,
      actionType: "course-enrollment",
      title: "Approve course enrollment",
      description: `Enroll ${actor.name} in ${pending.courseTitle}.`,
      userId: pending.userId,
      courseId: pending.courseId,
      courseTitle: pending.courseTitle,
      risk: "This action creates an enrollment record and changes application data.",
    };

    /*
     * Do not wrap interrupt() in a general try/catch.
     * LangGraph uses its interrupt signal to pause execution.
     */
    const response = interrupt(approvalRequest);

    if (!isApprovalResume(response)) {
      throw new Error("The approval response was invalid.");
    }

    if (
      response.actionId !== pending.actionId ||
      response.decidedBy !== actor.userId
    ) {
      throw new Error(
        "The approval response did not match the pending action.",
      );
    }

    return {
      approvalStatus: response.approved ? "approved" : "rejected",
    };
  };

  const executeEnrollmentNode: typeof LearningGraphState.Node = async (
    state,
  ) => {
    assertPermission(actor, "enrollment:request");

    const pending = state.pendingEnrollment;

    if (!pending) {
      throw new Error("The approved enrollment action was not found.");
    }

    if (pending.userId !== actor.userId) {
      throw new Error("The enrollment action belongs to another user.");
    }

    reportEvent({
      type: "tool-start",
      toolName: "requestCourseEnrollment",
      message: "Creating the approved enrollment record...",
    });

    const result = createCourseEnrollment({
      actionId: pending.actionId,
      userId: pending.userId,
      courseId: pending.courseId,
      courseTitle: pending.courseTitle,
      approvedBy: actor.userId,
    });

    const message = result.created
      ? `Enrollment approved. You are now enrolled in ${pending.courseTitle}.`
      : `You are already enrolled in ${pending.courseTitle}; no duplicate record was created.`;

    reportEvent({
      type: "tool-result",
      toolName: "requestCourseEnrollment",
      summary: message,
    });

    reportEvent({
      type: "approval-resolved",
      actionId: pending.actionId,
      approved: true,
      message,
    });

    reportEvent({
      type: "token",
      content: `\n\n${message}`,
    });

    return {
      approvalStatus: "approved",
      finalAnswer: message,
      conversation: [
        {
          role: "assistant",
          content: message,
        },
      ],
    };
  };

  const rejectEnrollmentNode: typeof LearningGraphState.Node = async (
    state,
  ) => {
    const pending = state.pendingEnrollment;

    if (!pending) {
      throw new Error("The rejected enrollment action was not found.");
    }

    const message = `Enrollment in ${pending.courseTitle} was cancelled. No records were changed.`;

    reportEvent({
      type: "approval-resolved",
      actionId: pending.actionId,
      approved: false,
      message,
    });

    reportEvent({
      type: "token",
      content: `\n\n${message}`,
    });

    return {
      approvalStatus: "rejected",
      finalAnswer: message,
      conversation: [
        {
          role: "assistant",
          content: message,
        },
      ],
    };
  };

  const routeToSelectedAgent: ConditionalEdgeRouter<
    typeof LearningGraphState,
    Record<string, unknown>,
    RouterDestination
  > = (state) => {
    if (state.requestKind === "enrollment") {
      return "prepareEnrollment";
    }

    if (!state.selectedAgent) {
      throw new Error("The router did not select an agent.");
    }

    return state.selectedAgent;
  };

  return new StateGraph(LearningGraphState)
    .addNode("router", routerNode)
    .addNode("tutor", tutorNode)
    .addNode("certification", certificationNode)
    .addNode("analytics", analyticsNode)
    .addNode("prepareEnrollment", prepareEnrollmentNode)
    .addNode("approval", approvalNode)
    .addNode("executeEnrollment", executeEnrollmentNode)
    .addNode("rejectEnrollment", rejectEnrollmentNode)

    .addEdge(START, "router")

    .addConditionalEdges("router", routeToSelectedAgent, {
      tutor: "tutor",
      certification: "certification",
      analytics: "analytics",
      prepareEnrollment: "prepareEnrollment",
    })

    .addConditionalEdges(
      "prepareEnrollment",
      (state) => (state.pendingEnrollment ? "approval" : "end"),
      {
        approval: "approval",
        end: END,
      },
    )

    .addConditionalEdges(
      "approval",
      (state) => (state.approvalStatus === "approved" ? "execute" : "reject"),
      {
        execute: "executeEnrollment",
        reject: "rejectEnrollment",
      },
    )

    .addEdge("tutor", END)
    .addEdge("certification", END)
    .addEdge("analytics", END)
    .addEdge("executeEnrollment", END)
    .addEdge("rejectEnrollment", END)

    .compile({
      checkpointer: learningGraphCheckpointer,
    });
}
