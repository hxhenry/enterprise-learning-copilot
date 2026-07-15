type MessageComposerProps = {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
};

export function MessageComposer({
  input,
  isStreaming,
  onInputChange,
  onSubmit,
  onStop,
}: MessageComposerProps) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isStreaming) {
      onSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-200 bg-white p-4"
    >
      <div className="mx-auto flex max-w-4xl items-end gap-3">
        <label htmlFor="chat-message" className="sr-only">
          Ask the learning copilot a question
        </label>

        <textarea
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

              if (!isStreaming) {
                onSubmit();
              }
            }
          }}
          placeholder="Ask about a course or certification..."
          rows={1}
          disabled={isStreaming}
          className="min-h-12 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="h-12 rounded-xl bg-red-600 px-5 text-sm font-medium text-white transition hover:bg-red-700"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="h-12 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Send
          </button>
        )}
      </div>

      <p className="mx-auto mt-2 max-w-4xl text-xs text-slate-400">
        Press Enter to send. Press Shift + Enter for a new line.
      </p>
    </form>
  );
}