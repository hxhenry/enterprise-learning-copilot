// @vitest-environment node

import { INTERRUPT } from "@langchain/langgraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateLearningGraphOptions } from "@/lib/agents/graph";
import { PersistenceOperationError } from "@/lib/database/errors";
import type { RunContext } from "@/lib/observability/run-context";
import { createCheckpointThreadId } from "@/lib/security/checkpoint-thread";
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

import { POST } from "@/app/api/chat/route";

const runContext: RunContext = {
  requestId: "request-chat-123",
  agentRunId: "run-chat-123",
  threadId: "thread-123",
  operation: "chat",
};

function createRequest(
  body: unknown,
  signal?: AbortSignal,
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    mocks.createRunContext.mockReturnValue(runContext);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.createLearningGraph.mockReset();
    mocks.createRunContext.mockReset();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The request body must be valid JSON.",
    });
  });

  it.each([
    [{ message: "", threadId: "thread-123" }, "Message is required."],
    [
      { message: "Hello", threadId: "unsafe/thread" },
      "A valid conversation thread ID is required.",
    ],
  ])("validates the request before streaming", async (body, error) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.createLearningGraph).not.toHaveBeenCalled();
  });

  it("returns a typed configuration error when the API key is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await POST(
      createRequest({
        message: "Hello",
        threadId: "thread-123",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "SERVER_CONFIGURATION_ERROR",
      error: "The server configuration is invalid.",
    });
  });

  it("streams ordered protocol events with stable run metadata", async () => {
    const invoke = vi.fn(async () => ({
      finalAnswer: "Hello world",
    }));

    mocks.createLearningGraph.mockImplementation((value: unknown) => {
      const options = value as CreateLearningGraphOptions;

      options.reportEvent({
        type: "agent-selected",
        agentId: "tutor",
        agentName: "Course Tutor Agent",
        reason: "A course question was detected.",
      });
      options.reportEvent({ type: "token", content: "Hello " });
      options.reportEvent({ type: "token", content: "world" });

      return { invoke };
    });

    const response = await POST(
      createRequest({
        message: "  Explain IAM  ",
        threadId: "thread-123",
      }),
    );
    const events = await readAgentEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBe("request-chat-123");
    expect(events.map((event) => event.payload.type)).toEqual([
      "status",
      "agent-selected",
      "token",
      "token",
      "done",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(
      events.every(
        (event) =>
          event.requestId === "request-chat-123" &&
          event.agentRunId === "run-chat-123" &&
          event.threadId === "thread-123",
      ),
    ).toBe(true);

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "Explain IAM",
        conversation: [
          {
            role: "user",
            content: "Explain IAM",
          },
        ],
      }),
      expect.objectContaining({
        configurable: {
          thread_id: createCheckpointThreadId(
            "user-001",
            "thread-123",
          ),
        },
        recursionLimit: 12,
      }),
    );
  });

  it("turns a LangGraph interrupt into an approval event", async () => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => ({
        [INTERRUPT]: [
          {
            value: {
              actionId: "action-123",
              actionType: "course-enrollment",
              title: "Approve course enrollment",
              description: "Enroll Henry in Secure Cloud Networking.",
              userId: "user-001",
              courseId: "course-network-301",
              courseTitle: "Secure Cloud Networking",
              risk: "This action changes application data.",
            },
          },
        ],
      })),
    });

    const response = await POST(
      createRequest({
        message: "Enroll me in Secure Cloud Networking",
        threadId: "thread-123",
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.map((event) => event.payload.type)).toEqual([
      "status",
      "approval-required",
      "done",
    ]);
  });

  it("emits a typed public error without leaking the internal failure", async () => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => {
        throw Object.assign(new Error("provider-secret-stack"), {
          code: "ECONNRESET",
        });
      }),
    });

    const response = await POST(
      createRequest({
        message: "Hello",
        threadId: "thread-123",
      }),
    );
    const events = await readAgentEvents(response);
    const errorEvent = events.at(-1)?.payload;

    expect(errorEvent).toEqual({
      type: "error",
      code: "WORKFLOW_EXECUTION_FAILED",
      message: "The learning workflow could not complete the request.",
      retryable: false,
    });
    expect(JSON.stringify(events)).not.toContain("provider-secret-stack");
    expect(events.some((event) => event.payload.type === "done")).toBe(false);
  });

  it("marks a transient persistence failure as retryable", async () => {
    mocks.createLearningGraph.mockReturnValue({
      invoke: vi.fn(async () => {
        throw new PersistenceOperationError(
          Object.assign(new Error("database-host-secret"), {
            code: "ECONNREFUSED",
          }),
        );
      }),
    });

    const response = await POST(
      createRequest({
        message: "Hello",
        threadId: "thread-123",
      }),
    );
    const events = await readAgentEvents(response);

    expect(events.at(-1)?.payload).toEqual({
      type: "error",
      code: "PERSISTENCE_UNAVAILABLE",
      message:
        "Durable persistence is temporarily unavailable. Please retry.",
      retryable: true,
    });
    expect(JSON.stringify(events)).not.toContain("database-host-secret");
  });

  it("closes quietly when the browser cancels the request", async () => {
    let finishInvocation: ((value: { finalAnswer: string }) => void) | undefined;
    const invoke = vi.fn(
      () =>
        new Promise<{ finalAnswer: string }>((resolve) => {
          finishInvocation = resolve;
        }),
    );
    mocks.createLearningGraph.mockReturnValue({ invoke });

    const abortController = new AbortController();
    const response = await POST(
      createRequest(
        {
          message: "Hello",
          threadId: "thread-123",
        },
        abortController.signal,
      ),
    );

    abortController.abort();
    finishInvocation?.({ finalAnswer: "Too late" });

    const events = await readAgentEvents(response);

    expect(invoke).not.toHaveBeenCalled();
    expect(events.map((event) => event.payload.type)).toEqual(["status"]);
    expect(events.some((event) => event.payload.type === "error")).toBe(false);
    expect(events.some((event) => event.payload.type === "done")).toBe(false);
  });
});
