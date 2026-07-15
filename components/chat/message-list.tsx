"use client";

import { useEffect, useRef } from "react";

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
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id === streamingMessageId}
        />
      ))}

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