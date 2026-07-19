// @vitest-environment node

import { Command, INTERRUPT } from "@langchain/langgraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateLearningGraphOptions } from "@/lib/agents/graph";
import type { RunContext } from "@/lib/observability/run-context";
import { readAgentEvents } from "@/tests/helpers/sse";

const mocks = vi.hoisted(() => ({
  createLearningGraph: vi.fn(),
  createRunContext: vi.fn(),
}));

vi.mock("@/lib/agents/graph", () => ({
  createLearningGraph: mocks.createLearningGraph,
}));

vi.mock("@/lib/observability/run-context", () => ({
  createRunContext: mocks.createRunContext,
}));

import { POST } from "@/app/api/chat/approval/route";

const runContext: RunContext = {
  requestId: "request-approval-123",
  agentRunId: "run-approval-123",
  threadId: "thread-123",
  operation: "approval",
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/approval", () => {
  beforeEach(() => {
    mocks.createRunContext.mockReturnValue(runContext);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.createLearningGraph.mockReset();
    mocks.createRunContext.mockReset();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/approval", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
  });

  it.each([
    { threadId: "unsafe/thread", actionId: "action-123", approved: true },
    { threadId: "thread-123", actionId: "", approved: true },
    { threadId: "thread-123", actionId: "action-123", approved: "yes" },
  ])("rejects invalid approval input: %o", async (body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.createLearningGraph).not.toHaveBeenCalled();
  });

  it.each([
    [true, "Approved by the user."],
    [false, "Rejected by the user."],
  ])(
    "resumes the checkpoint with a server-controlled decision (%s)",
    async (approved, reason) => {
      const invoke = vi.fn(
        async (_command: unknown, _config: unknown) => {
          void _command;
          void _config;

          return {
            finalAnswer: approved
              ? "Enrollment approved."
              : "Enrollment cancelled.",
            approvalStatus: approved ? "approved" : "rejected",
            pendingEnrollment: null,
            resolvedEnrollmentActionId: "action-123",
          };
        },
      );

      mocks.createLearningGraph.mockImplementation((value: unknown) => {
        const options = value as CreateLearningGraphOptions;

        options.reportEvent({
          type: "approval-resolved",
          actionId: "action-123",
          approved,
          message: approved ? "Enrollment approved." : "Enrollment cancelled.",
        });

        return { invoke };
      });

      const response = await POST(
        createRequest({
          threadId: "thread-123",
          actionId: "action-123",
          approved,
        }),
      );
      const events = await readAgentEvents(response);

      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-request-id")).toBe(
        "request-approval-123",
      );
      expect(events.map((event) => event.payload.type)).toEqual([
        "status",
        "approval-resolved",
        "done",
      ]);

      const command = invoke.mock.calls[0]?.[0];
      expect(command).toBeInstanceOf(Command);
      expect(command).toMatchObject({
        resume: {
          actionId: "action-123",
          approved,
          decidedBy: "user-001",
          reason,
        },
      });
      expect(invoke.mock.calls[0]?.[1]).toMatchObject({
        configurable: {
          thread_id: "thread-123",
        },
        recursionLimit: 12,
      });
    },
  );

  it("replays a validated terminal decision without duplicating the write", async () => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => ({
        finalAnswer: "Enrollment approved.",
        approvalStatus: "approved",
        pendingEnrollment: null,
        resolvedEnrollmentActionId: "action-123",
      })),
    });

    const response = await POST(
      createRequest({
        threadId: "thread-123",
        actionId: "action-123",
        approved: true,
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.map((event) => event.payload.type)).toEqual([
      "status",
      "approval-resolved",
      "done",
    ]);
    expect(events[1]?.payload).toEqual({
      type: "approval-resolved",
      actionId: "action-123",
      approved: true,
      message: "Enrollment approved.",
    });
  });

  it.each([
    {
      finalAnswer: "",
      approvalStatus: "approved",
      pendingEnrollment: null,
      resolvedEnrollmentActionId: "action-123",
    },
    {
      finalAnswer: "Enrollment approved.",
      approvalStatus: "rejected",
      pendingEnrollment: null,
      resolvedEnrollmentActionId: "action-123",
    },
    {
      finalAnswer: "Enrollment approved.",
      approvalStatus: "approved",
      pendingEnrollment: null,
      resolvedEnrollmentActionId: "another-action",
    },
    {
      finalAnswer: "Enrollment approved.",
      approvalStatus: "approved",
      pendingEnrollment: {
        actionId: "action-123",
      },
      resolvedEnrollmentActionId: "action-123",
    },
  ])("rejects an inconsistent terminal result: %o", async (result) => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => result),
    });

    const response = await POST(
      createRequest({
        threadId: "thread-123",
        actionId: "action-123",
        approved: true,
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.at(-1)?.payload).toMatchObject({
      type: "error",
      code: "APPROVAL_EXECUTION_FAILED",
    });
    expect(events.some((event) => event.payload.type === "done")).toBe(false);
  });

  it("rejects a resolution event for another action", async () => {
    mocks.createLearningGraph.mockImplementation((value: unknown) => {
      const options = value as CreateLearningGraphOptions;

      return {
        invoke: vi.fn(async () => {
          options.reportEvent({
            type: "approval-resolved",
            actionId: "another-action",
            approved: true,
            message: "Wrong action.",
          });

          return {
            finalAnswer: "Wrong action.",
            approvalStatus: "approved",
            pendingEnrollment: null,
            resolvedEnrollmentActionId: "another-action",
          };
        }),
      };
    });

    const response = await POST(
      createRequest({
        threadId: "thread-123",
        actionId: "action-123",
        approved: true,
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.map((event) => event.payload.type)).toEqual([
      "status",
      "error",
    ]);
  });

  it("does not expose buffered success events when terminal validation fails", async () => {
    mocks.createLearningGraph.mockImplementation((value: unknown) => {
      const options = value as CreateLearningGraphOptions;

      return {
        invoke: vi.fn(async () => {
          options.reportEvent({
            type: "approval-resolved",
            actionId: "action-123",
            approved: true,
            message: "Enrollment approved.",
          });
          options.reportEvent({
            type: "token",
            content: "Enrollment approved.",
          });

          return {
            finalAnswer: "Enrollment approved.",
            approvalStatus: "rejected",
            pendingEnrollment: null,
            resolvedEnrollmentActionId: "action-123",
          };
        }),
      };
    });

    const response = await POST(
      createRequest({
        threadId: "thread-123",
        actionId: "action-123",
        approved: true,
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.map((event) => event.payload.type)).toEqual([
      "status",
      "error",
    ]);
  });

  it("serializes conflicting decisions so the first terminal decision wins", async () => {
    let invocationIndex = 0;
    let activeInvocations = 0;
    let maximumActiveInvocations = 0;
    let notifyFirstStarted: () => void = () => undefined;
    let releaseFirst: () => void = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      notifyFirstStarted = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    mocks.createLearningGraph.mockImplementation((value: unknown) => {
      const options = value as CreateLearningGraphOptions;

      return {
        invoke: vi.fn(async () => {
          const currentInvocation = invocationIndex;
          invocationIndex += 1;
          activeInvocations += 1;
          maximumActiveInvocations = Math.max(
            maximumActiveInvocations,
            activeInvocations,
          );

          try {
            if (currentInvocation === 0) {
              notifyFirstStarted();
              await firstRelease;
              options.reportEvent({
                type: "approval-resolved",
                actionId: "action-concurrent",
                approved: true,
                message: "Enrollment approved.",
              });
            }

            return {
              finalAnswer: "Enrollment approved.",
              approvalStatus: "approved",
              pendingEnrollment: null,
              resolvedEnrollmentActionId: "action-concurrent",
            };
          } finally {
            activeInvocations -= 1;
          }
        }),
      };
    });

    const approvedResponse = await POST(
      createRequest({
        threadId: "thread-concurrent",
        actionId: "action-concurrent",
        approved: true,
      }),
    );

    await firstStarted;

    const rejectedResponse = await POST(
      createRequest({
        threadId: "thread-concurrent",
        actionId: "action-concurrent",
        approved: false,
      }),
    );

    expect(mocks.createLearningGraph).toHaveBeenCalledTimes(1);
    releaseFirst();

    const [approvedEvents, rejectedEvents] = await Promise.all([
      readAgentEvents(approvedResponse),
      readAgentEvents(rejectedResponse),
    ]);

    expect(maximumActiveInvocations).toBe(1);
    expect(approvedEvents.at(-1)?.payload.type).toBe("done");
    expect(rejectedEvents.at(-1)?.payload).toMatchObject({
      type: "error",
      code: "APPROVAL_EXECUTION_FAILED",
    });
  });

  it("emits a typed error when the graph interrupts again", async () => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => ({
        [INTERRUPT]: [],
      })),
    });

    const response = await POST(
      createRequest({
        threadId: "thread-123",
        actionId: "action-123",
        approved: true,
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.at(-1)?.payload).toEqual({
      type: "error",
      code: "APPROVAL_EXECUTION_FAILED",
      message: "The approval decision could not be applied.",
      retryable: false,
    });
    expect(events.some((event) => event.payload.type === "done")).toBe(false);
  });
});
