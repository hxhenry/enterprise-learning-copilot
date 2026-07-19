import type { ExperienceBlock } from "@/lib/schemas/events";

type SourcesBlock = Extract<
  ExperienceBlock,
  { kind: "sources" }
>;

type SourceListProps = {
  block: SourcesBlock;
};

export function SourceList({ block }: SourceListProps) {
  if (block.sources.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">
            RAG grounding
          </p>

          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            Grounding evidence
          </h3>
        </div>

        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
          {block.sources.length} {block.sources.length === 1 ? "passage" : "passages"}
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {block.sources.map((source) => (
          <li
            key={`${source.citationId}-${source.source}`}
            className="rounded-xl bg-slate-50 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                {source.citationId}
              </span>

              <p className="text-sm font-medium text-slate-800">
                {source.title}
              </p>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {source.source} · {source.category}
            </p>

            <p className="mt-2 text-xs leading-5 text-slate-600">
              {source.excerpt}
              {source.excerpt.length >= 180 ? "…" : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
