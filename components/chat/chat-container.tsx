"use client";

import { useRef, useState } from "react";

import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import {
  isAgentEvent,
  type AgentEvent,
  type ChatMessage,
} from "@/lib/schemas/events";

const initialMessages: ChatMessage[] = [
  {
    id: "welcome-message",
    role: "assistant",
    content:
      "Welcome to Enterprise Learning Copilot. Ask me about technical concepts, learning plans, or certification preparation.",
  },
];

export function ChatContainer() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  function updateAssistantMessage(
    assistantMessageId: string,
    updater: (currentContent: string) => string,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              content: updater(message.content),
            }
          : message,
      ),
    );
  }

  function handleAgentEvent(event: AgentEvent, assistantMessageId: string) {
    switch (event.type) {
      case "status":
        setStatus(event.message);
        break;

      case "agent-selected":
        setStatus(`${event.agentName} selected: ${event.reason}`);
        break;

      case "tool-start":
        setStatus(event.message);
        break;

      case "tool-result":
        setStatus(event.summary);
        break;

      case "token":
        updateAssistantMessage(
          assistantMessageId,
          (currentContent) => currentContent + event.content,
        );
        break;

      case "done":
        setStatus(null);
        break;

      case "error":
        throw new Error(event.message);
    }
  }

  async function processStream(response: Response, assistantMessageId: string) {
    if (!response.body) {
      throw new Error("The server did not return a response stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const eventBlocks = buffer.split("\n\n");

      buffer = eventBlocks.pop() ?? "";

      for (const eventBlock of eventBlocks) {
        const dataLine = eventBlock
          .split("\n")
          .find((line) => line.startsWith("data:"));

        if (!dataLine) {
          continue;
        }

        const eventData = dataLine.slice("data:".length).trim();
        const parsedEvent: unknown = JSON.parse(eventData);

        if (!isAgentEvent(parsedEvent)) {
          throw new Error("The server returned an invalid agent event.");
        }

        handleAgentEvent(parsedEvent, assistantMessageId);
      }
    }
  }

  async function handleSubmit() {
    const messageText = input.trim();

    if (!messageText || isStreaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ]);

    setInput("");
    setStatus("Sending request...");
    setIsStreaming(true);
    setStreamingMessageId(assistantMessage.id);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          responseBody?.error ??
            `The request failed with status ${response.status}.`,
        );
      }

      await processStream(response, assistantMessage.id);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        updateAssistantMessage(
          assistantMessage.id,
          (currentContent) =>
            currentContent || "Response generation was stopped.",
        );

        setStatus("Generation stopped.");
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.";

        updateAssistantMessage(assistantMessage.id, (currentContent) =>
          currentContent
            ? `${currentContent}\n\nError: ${errorMessage}`
            : `Error: ${errorMessage}`,
        );

        setStatus(null);
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xl">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Learning Copilot</h2>

            <p className="text-sm text-slate-500">
              LangGraph multi-agent learning platform
            </p>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            Online
          </span>
        </div>
      </header>

      <MessageList
        messages={messages}
        streamingMessageId={streamingMessageId}
        status={status}
      />

      <MessageComposer
        input={input}
        isStreaming={isStreaming}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </section>
  );
}
