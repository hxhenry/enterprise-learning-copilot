"use client";

import { useEffect, useRef } from "react";

import { AgentActivityTimeline } from "@/components/agents/agent-activity-timeline";
import { ExperienceBlockRenderer } from "@/components/agents/experience-block-renderer";
import { MessageBubble } from "@/components/chat/message-bubble";
import type { ChatMessage } from "@/lib/schemas/events";

type MessageListProps = {
  messages: ChatMessage[];
  streamingMessageId: string | null;
  status: string | null;
};

export function MessageList({
  messages,
  streamingMessageId,
  status,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({
      behavior: "auto",
      block: "end",
    });
  }, [messages, status]);

  return (
    <div
      className="flex min-h-[22rem] max-h-[55dvh] flex-none flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8 lg:min-h-0 lg:max-h-none lg:flex-1"
      role="log"
      aria-label="Conversation"
      aria-relevant="additions"
    >
      {messages.map((message) => {
        const activities = message.activities ?? [];
        const experienceBlocks =
          message.experienceBlocks ?? [];

        const isAssistant = message.role === "assistant";

        return (
          <div key={message.id} className="space-y-3">
            {isAssistant && activities.length > 0 ? (
              <div className="max-w-[98%] md:max-w-[88%]">
                <AgentActivityTimeline activities={activities} />
              </div>
            ) : null}

            <MessageBubble
              message={message}
              isStreaming={
                message.id === streamingMessageId
              }
            />

            {isAssistant && experienceBlocks.length > 0 ? (
              <div className="max-w-[98%] space-y-3 md:max-w-[88%]">
                <ExperienceBlockRenderer
                  blocks={experienceBlocks}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {status ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-slate-600"
        >
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-blue-500"
            aria-hidden="true"
          />
          <span>{status}</span>
        </div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
