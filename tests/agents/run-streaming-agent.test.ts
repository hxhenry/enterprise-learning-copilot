// @vitest-environment node

import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { simulateReadableStream, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { runStreamingAgent } from "@/lib/agents/run-streaming-agent";
import type { AgentEventPayload } from "@/lib/schemas/events";

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 3,
    text: 3,
    reasoning: 0,
  },
};

function createModel(chunks: LanguageModelV4StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: {
      stream: simulateReadableStream({ chunks }),
    },
  });
}

function createBaseChunks(
  textDeltas: string[],
): LanguageModelV4StreamPart[] {
  return [
    {
      type: "stream-start",
      warnings: [],
    },
    {
      type: "text-start",
      id: "text-1",
    },
    ...textDeltas.map(
      (delta): LanguageModelV4StreamPart => ({
        type: "text-delta",
        id: "text-1",
        delta,
      }),
    ),
    {
      type: "text-end",
      id: "text-1",
    },
    {
      type: "finish",
      usage,
      finishReason: {
        unified: "stop",
        raw: "stop",
      },
    },
  ];
}

describe("streaming agent runner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits text deltas and returns their complete answer", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const events: AgentEventPayload[] = [];
    const model = createModel(createBaseChunks(["Hello", ", ", "world"]));
    const abortController = new AbortController();

    const answer = await runStreamingAgent({
      agentId: "tutor",
      agentName: "Course Tutor Agent",
      systemPrompt: "Use trusted course documents.",
      conversation: [
        {
          role: "user",
          content: "Explain IAM.",
        },
      ],
      tools: {},
      reportEvent: (event) => events.push(event),
      abortSignal: abortController.signal,
      runContext: {
        requestId: "request-123",
        agentRunId: "run-123",
        threadId: "thread-123",
        operation: "chat",
      },
      model,
    });

    expect(answer).toBe("Hello, world");
    expect(
      events.filter((event) => event.type === "token"),
    ).toEqual([
      { type: "token", content: "Hello" },
      { type: "token", content: ", " },
      { type: "token", content: "world" },
    ]);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]?.prompt).toEqual([
      {
        role: "system",
        content: "Use trusted course documents.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Explain IAM.",
          },
        ],
      },
    ]);
    const forwardedSignal = model.doStreamCalls[0]?.abortSignal;

    expect(forwardedSignal?.aborted).toBe(false);
    abortController.abort();
    expect(forwardedSignal?.aborted).toBe(true);
  });

  it("returns only accumulated text after cancellation", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const abortController = new AbortController();
    const events: AgentEventPayload[] = [];
    const model = createModel(createBaseChunks(["First", " second"]));

    const answer = await runStreamingAgent({
      agentId: "tutor",
      agentName: "Course Tutor Agent",
      systemPrompt: "Test prompt",
      conversation: [{ role: "user", content: "Test" }],
      tools: {},
      reportEvent: (event) => {
        events.push(event);
        if (event.type === "token") {
          abortController.abort();
        }
      },
      abortSignal: abortController.signal,
      runContext: {
        requestId: "request-cancel",
        agentRunId: "run-cancel",
        threadId: "thread-cancel",
        operation: "chat",
      },
      model,
    });

    expect(answer).toBe("First");
    expect(events.filter((event) => event.type === "token")).toHaveLength(1);
  });

  it("executes a typed tool before streaming the final answer", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const execute = vi.fn(async ({ topic }: { topic: string }) => ({
      topic,
      summary: "Least privilege limits unnecessary access.",
    }));
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "tool-call-1",
                toolName: "lookupConcept",
                input: JSON.stringify({ topic: "IAM" }),
              },
              {
                type: "finish",
                usage,
                finishReason: {
                  unified: "tool-calls",
                  raw: "tool_calls",
                },
              },
            ],
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: createBaseChunks([
              "Least privilege limits unnecessary access.",
            ]),
          }),
        },
      ],
    });

    const answer = await runStreamingAgent({
      agentId: "tutor",
      agentName: "Course Tutor Agent",
      systemPrompt: "Use the lookup tool.",
      conversation: [{ role: "user", content: "Explain IAM." }],
      tools: {
        lookupConcept: tool({
          description: "Look up a technical concept.",
          inputSchema: z.object({
            topic: z.string(),
          }),
          execute,
        }),
      },
      reportEvent: () => undefined,
      abortSignal: new AbortController().signal,
      runContext: {
        requestId: "request-tool",
        agentRunId: "run-tool",
        threadId: "thread-tool",
        operation: "chat",
      },
      model,
    });

    expect(execute).toHaveBeenCalledWith(
      { topic: "IAM" },
      expect.objectContaining({
        toolCallId: "tool-call-1",
      }),
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(answer).toBe("Least privilege limits unnecessary access.");
  });

  it("rejects a response that contains no answer text", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const model = createModel([
      { type: "stream-start", warnings: [] },
      {
        type: "finish",
        usage,
        finishReason: {
          unified: "stop",
          raw: "stop",
        },
      },
    ]);

    await expect(
      runStreamingAgent({
        agentId: "tutor",
        agentName: "Course Tutor Agent",
        systemPrompt: "Test prompt",
        conversation: [{ role: "user", content: "Test" }],
        tools: {},
        reportEvent: () => undefined,
        abortSignal: new AbortController().signal,
        runContext: {
          requestId: "request-empty",
          agentRunId: "run-empty",
          threadId: "thread-empty",
          operation: "chat",
        },
        model,
      }),
    ).rejects.toThrow("Course Tutor Agent returned no response text.");
  });
});
