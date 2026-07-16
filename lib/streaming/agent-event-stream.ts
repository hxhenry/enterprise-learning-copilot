import {
  isAgentEvent,
  type AgentEvent,
} from "@/lib/schemas/events";

const encoder = new TextEncoder();

export function encodeAgentEvent(event: AgentEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function getAgentEventData(eventBlock: string): string | null {
  const dataLine = eventBlock
    .split("\n")
    .find((line) => line.startsWith("data:"));

  return dataLine?.slice("data:".length).trim() || null;
}

type ConsumeAgentEventStreamOptions = {
  expectedThreadId: string;
  onEvent: (event: AgentEvent) => void;
};

export async function consumeAgentEventStream(
  response: Response,
  {
    expectedThreadId,
    onEvent,
  }: ConsumeAgentEventStreamOptions,
): Promise<void> {
  if (!response.body) {
    throw new Error("The server did not return a response stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const expectedRequestId = response.headers
    .get("X-Request-Id")
    ?.trim();

  let buffer = "";
  let lastSequence = 0;
  let agentRunId: string | null = null;
  let terminalEventReceived = false;

  const processEventBlock = (eventBlock: string) => {
    const eventData = getAgentEventData(eventBlock);

    if (!eventData) {
      return;
    }

    let parsedEvent: unknown;

    try {
      parsedEvent = JSON.parse(eventData);
    } catch {
      throw new Error("The server returned an invalid agent event.");
    }

    if (!isAgentEvent(parsedEvent)) {
      throw new Error("The server returned an invalid agent event.");
    }

    if (terminalEventReceived) {
      throw new Error("The server returned an event after stream completion.");
    }

    if (parsedEvent.sequence !== lastSequence + 1) {
      throw new Error("The server returned an out-of-sequence agent event.");
    }

    if (
      parsedEvent.requestId !== expectedRequestId ||
      parsedEvent.threadId !== expectedThreadId
    ) {
      throw new Error("The server returned an event for a different request.");
    }

    if (agentRunId === null) {
      agentRunId = parsedEvent.agentRunId;
    } else if (parsedEvent.agentRunId !== agentRunId) {
      throw new Error("The server changed agent runs during the response.");
    }

    lastSequence = parsedEvent.sequence;
    terminalEventReceived =
      parsedEvent.payload.type === "done" ||
      parsedEvent.payload.type === "error";

    onEvent(parsedEvent);
  };

  const processCompleteBlocks = () => {
    const eventBlocks = buffer.split(/\r?\n\r?\n/);

    buffer = eventBlocks.pop() ?? "";

    for (const eventBlock of eventBlocks) {
      processEventBlock(eventBlock);
    }
  };

  try {
    if (!expectedRequestId) {
      throw new Error("The server response is missing its request identity.");
    }

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });
      processCompleteBlocks();
    }

    buffer += decoder.decode();
    processCompleteBlocks();

    if (buffer.trim()) {
      processEventBlock(buffer);
    }

    if (!terminalEventReceived) {
      throw new Error("The server response ended before completion.");
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
