import type { ChatMessage } from "@/lib/schemas/events";

type MessageBubbleProps = {
  message: ChatMessage;
  isStreaming?: boolean;
};

export function MessageBubble({
  message,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex w-full ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm md:max-w-[75%] ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-slate-200 bg-white text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap">
          {message.content ||
            (isStreaming ? "Thinking..." : "No response received.")}
        </p>
      </div>
    </div>
  );
}