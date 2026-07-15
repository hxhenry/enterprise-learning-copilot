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
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, status]);

  return (
    <div
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 md:px-8"
      aria-live="polite"
    >
      {messages.map((message) => {
        const activities = message.activities ?? [];
        const experienceBlocks =
          message.experienceBlocks ?? [];

        const hasStructuredExperience =
          message.role === "assistant" &&
          (activities.length > 0 ||
            experienceBlocks.length > 0);

        return (
          <div key={message.id} className="space-y-3">
            <MessageBubble
              message={message}
              isStreaming={
                message.id === streamingMessageId
              }
            />

            {hasStructuredExperience ? (
              <div className="max-w-[95%] space-y-3 md:max-w-[85%]">
                <AgentActivityTimeline
                  activities={activities}
                />

                <ExperienceBlockRenderer
                  blocks={experienceBlocks}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {status ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
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