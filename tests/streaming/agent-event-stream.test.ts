import { describe, expect, it, vi } from "vitest";

import {
  consumeAgentEventStream,
  encodeAgentEvent,
  getAgentEventData,
} from "@/lib/streaming/agent-event-stream";
import {
  AGENT_EVENT_PROTOCOL_VERSION,
  isAgentEvent,
  type AgentEvent,
  type AgentEventPayload,
} from "@/lib/schemas/events";

const event: AgentEvent = {
  protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
  sequence: 1,
  emittedAt: "2026-07-15T20:00:00.000Z",
  requestId: "request-123",
  agentRunId: "run-123",
  threadId: "thread-123",
  payload: {
    type: "token",
    content: "Hello",
  },
};

function createEvent(
  sequence: number,
  payload: AgentEventPayload,
  overrides: Partial<AgentEvent> = {},
): AgentEvent {
  return {
    ...event,
    sequence,
    payload,
    ...overrides,
  };
}

function createEventResponse(
  events: AgentEvent[],
  options: {
    requestId?: string;
    terminateBlock?: boolean;
  } = {},
): Response {
  const encoded = events
    .map((item) => new TextDecoder().decode(encodeAgentEvent(item)))
    .join("");

  return new Response(
    options.terminateBlock === false ? encoded.trimEnd() : encoded,
    {
      headers: options.requestId === undefined
        ? { "X-Request-Id": "request-123" }
        : { "X-Request-Id": options.requestId },
    },
  );
}

describe("agent event SSE encoding", () => {
  it("round-trips one validated event", () => {
    const encoded = new TextDecoder().decode(encodeAgentEvent(event));

    expect(encoded.endsWith("\n\n")).toBe(true);

    const data = getAgentEventData(encoded.trimEnd());
    const parsed: unknown = JSON.parse(data ?? "null");

    expect(parsed).toEqual(event);
    expect(isAgentEvent(parsed)).toBe(true);
  });

  it("ignores blocks without an SSE data field", () => {
    expect(getAgentEventData(": heartbeat")).toBeNull();
    expect(getAgentEventData("event: status")).toBeNull();
  });

  it("consumes ordered events and flushes a final unterminated block", async () => {
    const events = [
      createEvent(1, { type: "token", content: "Hello" }),
      createEvent(2, { type: "done" }),
    ];
    const received: AgentEvent[] = [];

    await consumeAgentEventStream(
      createEventResponse(events, { terminateBlock: false }),
      {
        expectedThreadId: "thread-123",
        onEvent: (receivedEvent) => received.push(receivedEvent),
      },
    );

    expect(received).toEqual(events);
  });

  it("decodes CRLF events across byte and UTF-8 boundaries", async () => {
    const events = [
      createEvent(1, { type: "token", content: "Héllo" }),
      createEvent(2, { type: "done" }),
    ];
    const encoded = events
      .map((item) => new TextDecoder().decode(encodeAgentEvent(item)))
      .join("")
      .replaceAll("\n", "\r\n");
    const bytes = new TextEncoder().encode(encoded);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) {
          controller.enqueue(Uint8Array.of(byte));
        }

        controller.close();
      },
    });
    const received: AgentEvent[] = [];

    await consumeAgentEventStream(
      new Response(body, {
        headers: { "X-Request-Id": "request-123" },
      }),
      {
        expectedThreadId: "thread-123",
        onEvent: (receivedEvent) => received.push(receivedEvent),
      },
    );

    expect(received).toEqual(events);
  });

  it("rejects a response that ends without a terminal event", async () => {
    const response = createEventResponse([
      createEvent(1, { type: "token", content: "Partial" }),
    ]);

    await expect(
      consumeAgentEventStream(response, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("ended before completion");
  });

  it("rejects events after a terminal event", async () => {
    const response = createEventResponse([
      createEvent(1, { type: "done" }),
      createEvent(2, { type: "token", content: "Too late" }),
    ]);

    await expect(
      consumeAgentEventStream(response, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("after stream completion");
  });

  it("binds events to the response request and expected thread", async () => {
    const mismatchedRequest = createEventResponse([
      createEvent(1, { type: "done" }, { requestId: "another-request" }),
    ]);
    const mismatchedThread = createEventResponse([
      createEvent(1, { type: "done" }, { threadId: "another-thread" }),
    ]);

    await expect(
      consumeAgentEventStream(mismatchedRequest, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("different request");
    await expect(
      consumeAgentEventStream(mismatchedThread, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("different request");
  });

  it("requires stable sequence and agent-run identity", async () => {
    const skippedSequence = createEventResponse([
      createEvent(2, { type: "done" }),
    ]);
    const changedRun = createEventResponse([
      createEvent(1, { type: "token", content: "Hello" }),
      createEvent(2, { type: "done" }, { agentRunId: "another-run" }),
    ]);

    await expect(
      consumeAgentEventStream(skippedSequence, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("out-of-sequence");
    await expect(
      consumeAgentEventStream(changedRun, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("changed agent runs");
  });

  it("requires a response request ID and valid event JSON", async () => {
    const cancel = vi.fn();
    const missingIdentity = new Response(
      new ReadableStream<Uint8Array>({ cancel }),
    );
    const invalidJson = new Response("data: {\n\n", {
      headers: { "X-Request-Id": "request-123" },
    });

    await expect(
      consumeAgentEventStream(missingIdentity, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("missing its request identity");
    expect(cancel).toHaveBeenCalledOnce();
    await expect(
      consumeAgentEventStream(invalidJson, {
        expectedThreadId: "thread-123",
        onEvent: () => undefined,
      }),
    ).rejects.toThrow("invalid agent event");
  });

  it("requires a response body", async () => {
    await expect(
      consumeAgentEventStream(
        new Response(null, {
          headers: { "X-Request-Id": "request-123" },
        }),
        {
          expectedThreadId: "thread-123",
          onEvent: () => undefined,
        },
      ),
    ).rejects.toThrow("did not return a response stream");
  });
});
