import { PRESENTATION_SCENARIOS } from "@/lib/demo/presentation-scenarios";

type PresentationGuideProps = {
  disabled: boolean;
  onSelectPrompt: (prompt: string) => void;
};

const WORKFLOW_STEPS = [
  "Next.js UI",
  "Typed SSE",
  "LangGraph",
  "Tools + RAG",
  "Experience UI",
] as const;

export function PresentationGuide({
  disabled,
  onSelectPrompt,
}: PresentationGuideProps) {
  return (
    <aside
      aria-labelledby="demo-guide-title"
      className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-lg shadow-slate-200/60 backdrop-blur lg:sticky lg:top-6 lg:self-start"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
            Guided walkthrough
          </p>

          <h2
            id="demo-guide-title"
            className="mt-2 text-xl font-bold tracking-tight text-slate-950"
          >
            Four moments to show
          </h2>
        </div>

        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          5 min
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        Load a seeded prompt into the composer, then send it when you are
        ready to narrate the result.
      </p>

      <ol className="mt-5 space-y-3">
        {PRESENTATION_SCENARIOS.map((scenario) => (
          <li key={scenario.id}>
            <button
              type="button"
              disabled={disabled}
              aria-describedby={
                disabled ? "demo-guide-disabled-reason" : undefined
              }
              onClick={() => onSelectPrompt(scenario.prompt)}
              className="group w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-bold text-white transition group-hover:bg-blue-600">
                  {scenario.step}
                </span>

                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {scenario.capability}
                  </span>

                  <span className="mt-0.5 block text-sm font-semibold text-slate-900">
                    {scenario.title}
                  </span>

                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {scenario.description}
                  </span>
                </span>
              </div>
            </button>
          </li>
        ))}
      </ol>

      <p
        id="demo-guide-disabled-reason"
        className={`mt-3 text-xs leading-5 ${
          disabled ? "text-amber-700" : "text-slate-500"
        }`}
      >
        {disabled
          ? "Finish the current stream or approval before loading another scenario."
          : "New conversation resets the browser view; durable server records are not deleted."}
      </p>

      <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
          Request path
        </p>

        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-200">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="rounded-lg bg-white/10 px-2 py-1">{step}</span>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <span aria-hidden="true" className="text-slate-500">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
