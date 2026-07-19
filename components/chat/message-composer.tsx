import type { FormEvent, RefObject } from "react";

type MessageComposerProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  isStreaming: boolean;
  isApprovalPending: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
};

export function MessageComposer({
  textareaRef,
  input,
  isStreaming,
  isApprovalPending,
  onInputChange,
  onSubmit,
  onStop,
}: MessageComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isStreaming && !isApprovalPending) {
      onSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-slate-200 bg-white p-4"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-3 sm:flex-row sm:items-end">
        <label htmlFor="chat-message" className="sr-only">
          Ask the learning copilot a question
        </label>

        <textarea
          ref={textareaRef}
          id="chat-message"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();

              if (!isStreaming && !isApprovalPending) {
                onSubmit();
              }
            }
          }}
          placeholder={
            isApprovalPending
              ? "Approve or reject the pending action first."
              : "Ask about a course or certification..."
          }
          rows={1}
          disabled={isStreaming || isApprovalPending}
          className="min-h-12 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-100"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="h-12 rounded-xl bg-red-600 px-5 text-sm font-medium text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:w-auto"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || isApprovalPending}
            className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            Send
          </button>
        )}
      </div>

      <p className="mx-auto mt-2 max-w-4xl text-xs text-slate-500">
        {isApprovalPending
          ? "Resolve the pending approval before starting another request."
          : "Press Enter to send. Press Shift + Enter for a new line."}
      </p>
    </form>
  );
}
