"use client";

import { useEffect, useRef, useState } from "react";

import { MessageComposer } from "@/components/chat/message-composer";
import { MessageList } from "@/components/chat/message-list";
import { PresentationGuide } from "@/components/demo/presentation-guide";
import {
  type AgentActivityStatus,
  type AgentEventPayload,
  type ChatMessage,
  type ExperienceBlock,
  type ApprovalRequest,
} from "@/lib/schemas/events";
import { ApprovalRequestCard } from "@/components/learning/approval-request-card";
import { consumeAgentEventStream } from "@/lib/streaming/agent-event-stream";

type PendingApproval = {
  assistantMessageId: string;
  request: ApprovalRequest;
};

const initialMessages: ChatMessage[] = [
  {
    id: "welcome-message",
    role: "assistant",
    content:
      "Welcome to Enterprise Learning Copilot. Choose a guided scenario to see routing, tools, grounding evidence, structured UI, and human approval in one flow.",
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
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [completedResponseAnnouncement, setCompletedResponseAnnouncement] =
    useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const handledComposerFocusRequestRef = useRef(0);
  const streamedResponseTextRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (
      composerFocusRequest !== handledComposerFocusRequestRef.current &&
      !isStreaming &&
      pendingApproval === null
    ) {
      composerRef.current?.focus();
      handledComposerFocusRequestRef.current = composerFocusRequest;
    }
  }, [composerFocusRequest, isStreaming, pendingApproval]);

  function getThreadId(): string {
    if (threadIdRef.current) {
      return threadIdRef.current;
    }

    const threadId = crypto.randomUUID();
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
    event: Extract<AgentEventPayload, { type: "agent-selected" }>,
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

  function startApprovalActivity(
    assistantMessageId: string,
    request: ApprovalRequest,
  ) {
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      activities: [
        ...(message.activities ?? []).filter(
          (activity) => activity.id !== `approval-${request.actionId}`,
        ),
        {
          id: `approval-${request.actionId}`,
          kind: "approval",
          name: "Course enrollment",
          detail: `Waiting for your decision before enrolling in ${request.courseTitle}.`,
          status: "running",
        },
      ],
    }));
  }

  function completeApprovalActivity(
    assistantMessageId: string,
    actionId: string,
    detail: string,
  ) {
    updateMessage(assistantMessageId, (message) => ({
      ...message,
      activities: (message.activities ?? []).map((activity) =>
        activity.id === `approval-${actionId}`
          ? {
              ...activity,
              detail,
              status: "completed",
            }
          : activity,
      ),
    }));
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

  function handleAgentEvent(
    event: AgentEventPayload,
    assistantMessageId: string,
  ) {
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

        startApprovalActivity(assistantMessageId, event.request);

        setStatus(null);
        break;

      case "approval-resolved":
        setPendingApproval((current) =>
          current?.request.actionId === event.actionId ? null : current,
        );

        completeApprovalActivity(
          assistantMessageId,
          event.actionId,
          event.message,
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
        streamedResponseTextRef.current.set(
          assistantMessageId,
          (streamedResponseTextRef.current.get(assistantMessageId) ?? "") +
            event.content,
        );

        updateAssistantMessage(
          assistantMessageId,
          (currentContent) => currentContent + event.content,
        );
        break;

      case "done":
        {
          const completedResponse = streamedResponseTextRef.current
            .get(assistantMessageId)
            ?.trim();

          if (completedResponse) {
            setCompletedResponseAnnouncement(
              `Copilot response complete. ${completedResponse}`,
            );
          }
        }

        setStatus(null);
        break;

      case "error":
        throw new Error(event.message);
    }
  }

  async function processStream(
    response: Response,
    assistantMessageId: string,
    expectedThreadId: string,
  ) {
    await consumeAgentEventStream(response, {
      expectedThreadId,
      onEvent: (event) => {
        handleAgentEvent(event.payload, assistantMessageId);
      },
    });
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
      const threadId = getThreadId();
      const response = await fetch("/api/chat/approval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
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

      await processStream(response, assistantMessageId, threadId);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("Approval processing was stopped.");

        markRunningActivities(
          assistantMessageId,
          "stopped",
          "Approval processing was stopped by the user.",
        );
      } else {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected approval error occurred.";

        updateAssistantMessage(
          assistantMessageId,
          (currentContent) => `${currentContent}\n\nError: ${errorMessage}`,
        );

        markRunningActivities(assistantMessageId, "failed", errorMessage);

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
    setCompletedResponseAnnouncement("");
    setIsStreaming(true);
    setStreamingMessageId(assistantMessage.id);
    streamedResponseTextRef.current.set(assistantMessage.id, "");

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const threadId = getThreadId();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageText,
          threadId,
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

      await processStream(response, assistantMessage.id, threadId);
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

  function handleSelectPrompt(prompt: string) {
    setInput(prompt);
    composerRef.current?.focus();
  }

  function handleNewConversation() {
    if (isStreaming || pendingApproval) {
      return;
    }

    threadIdRef.current = null;
    setMessages(initialMessages);
    setInput("");
    setStatus(null);
    setCompletedResponseAnnouncement("");
    setStreamingMessageId(null);
    setPendingApproval(null);
    setApprovalInFlight(false);
    streamedResponseTextRef.current.clear();
    setComposerFocusRequest((currentRequest) => currentRequest + 1);
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section
        aria-labelledby="copilot-title"
        className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-slate-50 shadow-xl shadow-slate-300/40 lg:h-[78dvh] lg:min-h-[600px] lg:max-h-[840px]"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="copilot-title"
                className="font-semibold text-slate-950"
              >
                Learning Copilot
              </h2>

              <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
                Live routing, tool, grounding, and approval signals
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span
                title="Workflow checkpoints and enrollment records are stored only in this Node.js process and reset when the server restarts."
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-blue-500"
                />
                Local demo · process memory
              </span>

              <button
                type="button"
                disabled={isStreaming || pendingApproval !== null}
                onClick={handleNewConversation}
                title={
                  pendingApproval
                    ? "Resolve the pending approval before starting a new conversation."
                    : "Starts a new browser conversation. Existing process-local enrollment records are not deleted."
                }
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                New conversation
              </button>
            </div>
          </div>
        </header>

        <MessageList
          messages={messages}
          streamingMessageId={streamingMessageId}
          status={status}
        />

        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {completedResponseAnnouncement}
        </p>

        {pendingApproval ? (
          <div className="max-h-[60dvh] shrink-0 overflow-y-auto border-t border-slate-200 bg-white px-4 py-4 md:px-8">
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
          textareaRef={composerRef}
          input={input}
          isStreaming={isStreaming}
          isApprovalPending={pendingApproval !== null}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onStop={handleStop}
        />
      </section>

      <PresentationGuide
        disabled={isStreaming || pendingApproval !== null}
        selectedPrompt={input}
        onSelectPrompt={handleSelectPrompt}
      />
    </div>
  );
}
