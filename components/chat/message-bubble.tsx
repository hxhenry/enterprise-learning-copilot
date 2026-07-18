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
      aria-label={`${isUser ? "You" : "Copilot"} message`}
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
        <p
          className={`mb-1 text-[0.6875rem] font-bold uppercase tracking-wide ${
            isUser ? "text-white" : "text-blue-600"
          }`}
        >
          {isUser ? "You" : "Copilot"}
        </p>

        <p className="whitespace-pre-wrap">
          {message.content ||
            (isStreaming ? "Thinking..." : "No response received.")}

          {isStreaming ? (
            <span
              aria-hidden="true"
              className="ml-1 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-blue-500"
            />
          ) : null}
        </p>
      </div>
    </div>
  );
}
