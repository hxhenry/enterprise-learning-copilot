"use client";

import { PRESENTATION_SCENARIOS } from "@/lib/demo/presentation-scenarios";

type PresentationGuideProps = {
  disabled: boolean;
  onSelectPrompt: (prompt: string) => void;
};

const disabledDescriptionId = "presentation-guide-disabled-description";

export function PresentationGuide({
  disabled,
  onSelectPrompt,
}: PresentationGuideProps) {
  return (
    <section
      aria-labelledby="presentation-guide-title"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
            Interview walkthrough
          </p>

          <h2
            id="presentation-guide-title"
            className="mt-1 text-lg font-semibold text-slate-950"
          >
            Guided demo
          </h2>

          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Select a scenario to place a tested prompt in the chat composer.
            The demo uses fictional data and process-local memory.
          </p>
        </div>

        <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          4 scenarios
        </span>
      </div>

      {disabled ? (
        <p
          id={disabledDescriptionId}
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          role="status"
        >
          Finish the current response or approval before starting another
          guided scenario.
        </p>
      ) : null}

      <ol className="mt-5 space-y-3">
        {PRESENTATION_SCENARIOS.map((scenario) => (
          <li key={scenario.id}>
            <button
              type="button"
              aria-label={`Run demo scenario: ${scenario.title}`}
              aria-describedby={disabled ? disabledDescriptionId : undefined}
              disabled={disabled}
              onClick={() => onSelectPrompt(scenario.prompt)}
              className="group w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                {scenario.step}
              </span>

              <span className="mt-2 block font-semibold text-slate-900">
                {scenario.title}
              </span>

              <span className="mt-1 block text-sm leading-5 text-slate-600">
                {scenario.description}
              </span>

              <span className="mt-3 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-500 transition group-hover:border-indigo-200">
                “{scenario.prompt}”
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
