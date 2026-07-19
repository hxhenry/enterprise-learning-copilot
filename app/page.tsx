import { ChatContainer } from "@/components/chat/chat-container";

const CAPABILITIES = [
  "TypeScript",
  "Next.js",
  "LangGraph",
  "Typed SSE",
  "RAG + tools",
  "Human approval",
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-100 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_42%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.12),_transparent_38%)]"
      />

      <div className="relative mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                Agentic AI integration demo
              </p>

              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                v0.2
              </span>
            </div>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Enterprise Learning Copilot
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base">
              A presentation-ready, pre-production integration demo of
              streamed agent workflows, trusted experience components,
              grounded answers, and approval-gated writes.
            </p>

            <ul
              aria-label="Demonstrated technologies"
              className="mt-4 flex flex-wrap gap-2"
            >
              {CAPABILITIES.map((capability) => (
                <li
                  key={capability}
                  className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                >
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <div className="max-w-md rounded-2xl border border-slate-200/90 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Safe demo scope
            </p>

            <p className="mt-1 text-xs leading-5 text-slate-600">
              Seeded fictional learning data with process-local workflow
              memory. No production systems or employee records are connected.
            </p>
          </div>
        </header>

        <ChatContainer />
      </div>
    </main>
  );
}
