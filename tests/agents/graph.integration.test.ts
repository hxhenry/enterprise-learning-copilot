// @vitest-environment node

import {
  Command,
  INTERRUPT,
  MemorySaver,
  isInterrupted,
} from "@langchain/langgraph";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLearningGraph,
  type LearningGraphDependencies,
} from "@/lib/agents/graph";
import type { AgentId } from "@/lib/agents/registry";
import type { RunStreamingAgentOptions } from "@/lib/agents/run-streaming-agent";
import type { EnrollmentRepository } from "@/lib/repositories/contracts";
import { inMemoryLearningGraphRepositories } from "@/lib/repositories/in-memory-repositories";
import type { AgentEventPayload } from "@/lib/schemas/events";
import { getAuthenticatedActor } from "@/lib/security/authorization";

const actor = getAuthenticatedActor();

function createInitialState(message: string) {
  return {
    userMessage: message,
    conversation: [
      {
        role: "user" as const,
        content: message,
      },
    ],
    selectedAgent: null,
    routingReason: "",
    requestKind: "answer" as const,
    pendingEnrollment: null,
    resolvedEnrollmentActionId: null,
    approvalStatus: "not-required" as const,
    finalAnswer: "",
  };
}

function createConfig(threadId: string) {
  return {
    configurable: {
      thread_id: threadId,
    },
    recursionLimit: 12,
  };
}

function createEnrollmentRepository() {
  const createCourseEnrollment = vi.fn(
    async (input: Parameters<EnrollmentRepository["createCourseEnrollment"]>[0]) => ({
      created: true,
      record: {
        ...input,
        status: "enrolled" as const,
        approvedAt: "2026-07-15T20:05:00.000Z",
      },
    }),
  );

  const repository: EnrollmentRepository = {
    createCourseEnrollment,
    getUserEnrollments: async () => [],
  };

  return {
    repository,
    createCourseEnrollment,
  };
}

describe("learning graph integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each<{
    agentId: AgentId;
    expectedTools: string[];
  }>([
    {
      agentId: "tutor",
      expectedTools: ["searchCourseKnowledge"],
    },
    {
      agentId: "certification",
      expectedTools: [
        "getUserProfile",
        "getCompletedCourses",
        "getCertificationProgress",
        "getCertificationRequirements",
        "getCertificationCourses",
        "searchCourseKnowledge",
      ],
    },
    {
      agentId: "analytics",
      expectedTools: ["getDepartmentCertificationStats"],
    },
  ])(
    "routes to the $agentId agent with its allow-listed tools",
    async ({ agentId, expectedTools }) => {
      vi.spyOn(console, "info").mockImplementation(() => undefined);

      const observedRuns: RunStreamingAgentOptions[] = [];
      const events: AgentEventPayload[] = [];

      const routeRequest: LearningGraphDependencies["routeRequest"] =
        async () => ({
          agentId,
          requestKind: "answer",
          reason: `Use ${agentId}.`,
        });

      const runAgent: LearningGraphDependencies["runAgent"] = async (
        options,
      ) => {
        observedRuns.push(options);
        options.reportEvent({
          type: "token",
          content: `${agentId} answer`,
        });
        return `${agentId} answer`;
      };

      const graph = createLearningGraph({
        actor,
        abortSignal: new AbortController().signal,
        reportEvent: (event) => events.push(event),
        runContext: {
          requestId: `request-${agentId}`,
          agentRunId: `run-${agentId}`,
          threadId: `thread-${agentId}`,
          operation: "chat",
        },
        dependencies: {
          routeRequest,
          runAgent,
          checkpointer: new MemorySaver(),
          repositories: inMemoryLearningGraphRepositories,
        },
      });

      const result = await graph.invoke(
        createInitialState("Help me learn"),
        createConfig(`thread-${agentId}`),
      );

      expect(result.selectedAgent).toBe(agentId);
      expect(result.finalAnswer).toBe(`${agentId} answer`);
      expect(observedRuns).toHaveLength(1);
      expect(Object.keys(observedRuns[0]?.tools ?? {}).sort()).toEqual(
        [...expectedTools].sort(),
      );
      expect(events.some((event) => event.type === "agent-selected")).toBe(
        true,
      );
    },
  );

  it("interrupts enrollment and resumes the same checkpoint exactly once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const checkpointer = new MemorySaver();
    const events: AgentEventPayload[] = [];
    const routeRequest = vi.fn(async () => ({
      agentId: "certification" as const,
      requestKind: "enrollment" as const,
      reason: "The user requested enrollment.",
    }));
    const { repository, createCourseEnrollment } =
      createEnrollmentRepository();

    const commonOptions = {
      actor,
      abortSignal: new AbortController().signal,
      reportEvent: (event: AgentEventPayload) => events.push(event),
      runContext: {
        requestId: "request-enrollment",
        agentRunId: "run-enrollment",
        threadId: "thread-enrollment",
        operation: "chat" as const,
      },
      dependencies: {
        routeRequest,
        checkpointer,
        repositories: {
          ...inMemoryLearningGraphRepositories,
          enrollment: repository,
        },
        createActionId: () => "action-fixed",
        now: () => new Date("2026-07-15T20:00:00.000Z"),
      },
    };

    const initialGraph = createLearningGraph(commonOptions);
    const interrupted = await initialGraph.invoke(
      createInitialState("Enroll me in Secure Cloud Networking"),
      createConfig("thread-enrollment"),
    );

    expect(isInterrupted(interrupted)).toBe(true);

    if (!isInterrupted(interrupted)) {
      throw new Error("Expected the graph to interrupt.");
    }

    expect(interrupted[INTERRUPT][0]?.value).toMatchObject({
      actionId: "action-fixed",
      userId: "user-001",
      courseId: "course-network-301",
      courseTitle: "Secure Cloud Networking",
    });

    const resumedGraph = createLearningGraph(commonOptions);
    const result = await resumedGraph.invoke(
      new Command({
        resume: {
          actionId: "action-fixed",
          approved: true,
          decidedBy: "user-001",
        },
      }),
      createConfig("thread-enrollment"),
    );

    expect(result.approvalStatus).toBe("approved");
    expect(result.pendingEnrollment).toBeNull();
    expect(result.resolvedEnrollmentActionId).toBe("action-fixed");
    expect(result.finalAnswer).toContain("Enrollment approved");
    expect(routeRequest).toHaveBeenCalledTimes(1);
    expect(createCourseEnrollment).toHaveBeenCalledTimes(1);
    expect(createCourseEnrollment).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "action-fixed",
        userId: "user-001",
        courseId: "course-network-301",
        approvedBy: "user-001",
      }),
    );
    expect(
      events
        .filter((event) =>
          [
            "tool-start",
            "tool-result",
            "approval-resolved",
            "token",
          ].includes(event.type),
        )
        .map((event) => event.type),
    ).toEqual([
      "tool-start",
      "tool-result",
      "approval-resolved",
      "token",
    ]);

    const replayedGraph = createLearningGraph(commonOptions);
    const replayedResult = await replayedGraph.invoke(
      new Command({
        resume: {
          actionId: "action-fixed",
          approved: true,
          decidedBy: "user-001",
        },
      }),
      createConfig("thread-enrollment"),
    );

    expect(replayedResult.approvalStatus).toBe("approved");
    expect(replayedResult.resolvedEnrollmentActionId).toBe("action-fixed");
    expect(createCourseEnrollment).toHaveBeenCalledTimes(1);
  });

  it("rejects enrollment without executing the write", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const checkpointer = new MemorySaver();
    const events: AgentEventPayload[] = [];
    const { repository, createCourseEnrollment } =
      createEnrollmentRepository();
    const dependencies = {
      routeRequest: async () => ({
        agentId: "certification" as const,
        requestKind: "enrollment" as const,
        reason: "The user requested enrollment.",
      }),
      checkpointer,
      repositories: {
        ...inMemoryLearningGraphRepositories,
        enrollment: repository,
      },
      createActionId: () => "action-rejected",
    };
    const graphOptions = {
      actor,
      abortSignal: new AbortController().signal,
      reportEvent: (event: AgentEventPayload) => events.push(event),
      runContext: {
        requestId: "request-rejection",
        agentRunId: "run-rejection",
        threadId: "thread-rejection",
        operation: "chat" as const,
      },
      dependencies,
    };

    const initialGraph = createLearningGraph(graphOptions);
    await initialGraph.invoke(
      createInitialState("Enroll me in Secure Cloud Networking"),
      createConfig("thread-rejection"),
    );

    const resumedGraph = createLearningGraph(graphOptions);
    const result = await resumedGraph.invoke(
      new Command({
        resume: {
          actionId: "action-rejected",
          approved: false,
          decidedBy: "user-001",
        },
      }),
      createConfig("thread-rejection"),
    );

    expect(result.approvalStatus).toBe("rejected");
    expect(result.pendingEnrollment).toBeNull();
    expect(result.resolvedEnrollmentActionId).toBe("action-rejected");
    expect(result.finalAnswer).toContain("No records were changed");
    expect(createCourseEnrollment).not.toHaveBeenCalled();
    expect(
      events.find((event) => event.type === "approval-resolved"),
    ).toMatchObject({
      approved: false,
    });
  });
});
