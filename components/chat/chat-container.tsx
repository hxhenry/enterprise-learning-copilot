"use client";

import { useRef, useState } from "react";

import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import {
  isAgentEvent,
  type AgentActivityStatus,
  type AgentEvent,
  type ChatMessage,
  type ExperienceBlock,
  type ApprovalRequest,
} from "@/lib/schemas/events";
import { ApprovalRequestCard } from "@/components/learning/approval-request-card";

type PendingApproval = {
  assistantMessageId: string;
  request: ApprovalRequest;
};

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
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);

  const [approvalInFlight, setApprovalInFlight] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const threadIdRef = useRef<string | null>(null);

  function getThreadId(): string {
    if (threadIdRef.current) {
      return threadIdRef.current;
    }

    const storageKey = "enterprise-learning-thread-id";

    const storedThreadId = window.sessionStorage.getItem(storageKey);

    const threadId = storedThreadId ?? crypto.randomUUID();

    window.sessionStorage.setItem(storageKey, threadId);

    threadIdRef.current = threadId;

    return threadId;
  }

  function updateMessage(
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    );
  }

  function updateAssistantMessage(
    assistantMessageId: string,
    updater: (currentContent: string) => string,
  ) {
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      content: updater(message.content),
    }));
  }

  function addSelectedAgentActivity(
    assistantMessageId: string,
    event: Extract<AgentEvent, { type: "agent-selected" }>,
  ) {
    updateMessage(assistantMessageId, (message) => {
      const currentActivities = message.activities ?? [];

      return {
        ...message,
        activities: [
          ...currentActivities.filter((activity) => activity.kind !== "agent"),
          {
            id: `agent-${event.agentId}`,
            kind: "agent",
            name: event.agentName,
            detail: event.reason,
            status: "completed",
          },
        ],
      };
    });
  }

  function startToolActivity(
    assistantMessageId: string,
    toolName: string,
    detail: string,
  ) {
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      activities: [
        ...(message.activities ?? []),
        {
          id: crypto.randomUUID(),
          kind: "tool",
          name: toolName,
          detail,
          status: "running",
        },
      ],
    }));
  }

  function completeToolActivity(
    assistantMessageId: string,
    toolName: string,
    detail: string,
  ) {
    updateMessage(assistantMessageId, (message) => {
      const activities = [...(message.activities ?? [])];

      let matchingIndex = -1;

      for (let index = activities.length - 1; index >= 0; index -= 1) {
        const activity = activities[index];

        if (
          activity.kind === "tool" &&
          activity.name === toolName &&
          activity.status === "running"
        ) {
          matchingIndex = index;
          break;
        }
      }

      if (matchingIndex === -1) {
        activities.push({
          id: crypto.randomUUID(),
          kind: "tool",
          name: toolName,
          detail,
          status: "completed",
        });
      } else {
        activities[matchingIndex] = {
          ...activities[matchingIndex],
          detail,
          status: "completed",
        };
      }

      return {
        ...message,
        activities,
      };
    });
  }

  function addExperienceBlock(
    assistantMessageId: string,
    block: ExperienceBlock,
  ) {
    updateMessage(assistantMessageId, (message) => {
      const existingBlocks = message.experienceBlocks ?? [];

      return {
        ...message,
        experienceBlocks: [
          ...existingBlocks.filter(
            (existingBlock) => existingBlock.id !== block.id,
          ),
          block,
        ],
      };
    });
  }

  function markRunningActivities(
    assistantMessageId: string,
    status: Extract<AgentActivityStatus, "failed" | "stopped">,
    detail: string,
  ) {
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      activities: (message.activities ?? []).map((activity) =>
        activity.status === "running"
          ? {
              ...activity,
              status,
              detail,
            }
          : activity,
      ),
    }));
  }

  function handleAgentEvent(event: AgentEvent, assistantMessageId: string) {
    switch (event.type) {
      case "status":
        setStatus(event.message);
        break;

      case "agent-selected":
        setStatus(`${event.agentName} selected: ${event.reason}`);

        addSelectedAgentActivity(assistantMessageId, event);
        break;
      case "approval-required":
        setPendingApproval({
          assistantMessageId,
          request: event.request,
        });

        updateAssistantMessage(
          assistantMessageId,
          (currentContent) =>
            currentContent ||
            `Approval is required before enrolling you in ${event.request.courseTitle}.`,
        );

        setStatus(null);
        break;

      case "approval-resolved":
        setPendingApproval((current) =>
          current?.request.actionId === event.actionId ? null : current,
        );

        setStatus(event.message);
        break;
      case "tool-start":
        setStatus(event.message);

        startToolActivity(assistantMessageId, event.toolName, event.message);
        break;

      case "tool-result":
        setStatus(event.summary);

        completeToolActivity(assistantMessageId, event.toolName, event.summary);
        break;

      case "experience":
        addExperienceBlock(assistantMessageId, event.block);
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
  async function handleApprovalDecision(approved: boolean) {
    if (!pendingApproval || approvalInFlight) {
      return;
    }

    const { assistantMessageId, request: approvalRequest } = pendingApproval;

    setApprovalInFlight(true);
    setIsStreaming(true);
    setStreamingMessageId(assistantMessageId);

    setStatus(approved ? "Submitting approval..." : "Rejecting the action...");

    const abortController = new AbortController();

    abortControllerRef.current = abortController;

    try {
      const response = await fetch("/api/chat/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: getThreadId(),
          actionId: approvalRequest.actionId,
          approved,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const responseBody = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          responseBody?.error ??
            `The approval request failed with status ${response.status}.`,
        );
      }

      await processStream(response, assistantMessageId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Approval processing was stopped.");
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected approval error occurred.";

        updateAssistantMessage(
          assistantMessageId,
          (currentContent) => `${currentContent}\n\nError: ${errorMessage}`,
        );

        setStatus(null);
      }
    } finally {
      abortControllerRef.current = null;
      setApprovalInFlight(false);
      setIsStreaming(false);
      setStreamingMessageId(null);
    }
  }
  async function handleSubmit() {
    const messageText = input.trim();

    if (!messageText || isStreaming || pendingApproval) {
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
      activities: [],
      experienceBlocks: [],
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
          threadId: getThreadId(),
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

        markRunningActivities(
          assistantMessage.id,
          "stopped",
          "Generation was stopped by the user.",
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

        markRunningActivities(assistantMessage.id, "failed", errorMessage);

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
              Structured LangGraph multi-agent experience
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

      {pendingApproval ? (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:px-8">
          <div className="mx-auto max-w-4xl">
            <ApprovalRequestCard
              request={pendingApproval.request}
              isSubmitting={approvalInFlight}
              onDecision={handleApprovalDecision}
            />
          </div>
        </div>
      ) : null}

      <MessageComposer
        input={input}
        isStreaming={isStreaming}
        isApprovalPending={pendingApproval !== null}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onStop={handleStop}
      />
    </section>
  );
}
