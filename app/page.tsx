import { ChatContainer } from "@/components/chat/chat-container";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
            Agentic AI Demo
          </p>

          <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            Enterprise Learning Copilot
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            An agent-powered platform for employee learning,
            certification workflows, and business analytics.
          </p>
        </div>

        <ChatContainer />
      </div>
    </main>
  );
}