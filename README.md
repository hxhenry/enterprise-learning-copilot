# Enterprise Learning Copilot

Enterprise Learning Copilot is a presentation-ready integration demo for an
agentic learning experience. It combines a React and Next.js interface with
typed server-sent events (SSE), LangGraph orchestration, model-selected tools,
retrieval-augmented generation (RAG), and a human approval step for enrollment.

The demo deliberately uses fictional, process-local data. It is designed to
make the AI, API, and experience-layer boundaries easy to inspect without
requiring a database or other infrastructure.

## What the demo shows

| Capability | Implementation |
| --- | --- |
| Multi-agent routing | A LangGraph router selects tutor, certification, or analytics workflows |
| Streaming UI | Next.js route handlers emit typed protocol-v1 events over SSE |
| Tool calling | Agents call runtime-validated learning, analytics, and knowledge tools |
| RAG | Local Markdown is chunked, embedded, searched, and returned with source cards |
| Experience layer | React renders trusted progress, analytics, source, activity, and approval components |
| Human in the loop | Enrollment pauses at a LangGraph interrupt and resumes only after an explicit decision |
| Workflow state | LangGraph `MemorySaver` retains the conversation and pending approval while the process lives |
| Quality controls | Route, graph, tool, stream, security, component, and contract tests run through one quality gate |
| Observability | Structured JSON logs correlate requests, agent runs, threads, tools, timing, and failures |

## Architecture at a glance

```text
React chat and guided demo panel
              |
              v
Next.js chat / approval APIs
       (typed SSE events)
              |
              v
        LangGraph workflow
              |
      +-------+--------+
      |       |        |
      v       v        v
   Tutor  Certification Analytics
      |       |        |
      +-------+--------+
              |
       Validated tools
              |
   In-memory repositories + local documents
```

See [docs/architecture.md](docs/architecture.md) for the detailed request,
streaming, RAG, and approval flows.

## Run locally

Requirements:

- A current Node.js LTS release
- An OpenAI API key

Install dependencies and create the local environment file:

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`. The model and embedding model can be
overridden there as well.

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No PostgreSQL, Redis, MongoDB, ClickHouse, Docker, or Kubernetes installation
is required for this branch.

## Guided demonstration

The interface includes four guided scenarios. A concise live-demo sequence is:

1. Ask a technical question grounded in the local course documents.
2. Request the current Cloud Security Certification progress and learning plan.
3. Compare certification completion across departments.
4. Request enrollment in **Secure Cloud Networking**, then approve or reject it.

During the demonstration, point out the selected agent, tool activity, streamed
answer, structured experience component, and approval boundary—not only the
final text.

Use [docs/demo-guide.md](docs/demo-guide.md) for exact prompts, a five-minute
talk track, expected results, and recovery notes.

## Demo data and persistence

All business data is fictional:

- Learning catalog, users, progress, analytics, and enrollment records use
  asynchronous in-memory repository adapters.
- RAG source material is stored as Markdown under `data/documents`; its vector
  index is built in memory.
- LangGraph checkpoints use `MemorySaver`.
- Approval concurrency protection is limited to the current Node.js process.
- Logs are structured JSON written to the server console.

The **New conversation** control resets the browser conversation and creates a
new thread. It does not erase server-side in-memory enrollment records. A full
server restart clears all process-local checkpoints, indexes, and mutable demo
records.

This is an integration demo, not a production deployment. Durable storage,
enterprise identity, distributed coordination, centralized observability, and
container orchestration are documented as future work rather than represented
as implemented features.

## Quality checks

Run the complete quality gate:

```bash
npm run check
```

Or run checks individually:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
```

The complete gate enforces linting, TypeScript validation, coverage thresholds,
and a production build.

## Documentation

- [Architecture](docs/architecture.md) — implemented system boundaries and
  production roadmap
- [Demo guide](docs/demo-guide.md) — setup, prompts, presentation flow, and
  likely questions
- [JD alignment](docs/jd-alignment.md) — evidence mapped to the Agentic AI
  Engineer role
- [Changelog](CHANGELOG.md) — milestone history and known limitations

## Production roadmap

The repository contracts and typed protocol provide seams for future adapters,
but this branch does not implement them. Likely next steps include:

- Durable graph checkpoints and transactional records in PostgreSQL
- Persistent vector search using PostgreSQL/pgvector, MongoDB Atlas Vector
  Search, Redis Vector Search, or a dedicated vector database
- Redis-backed caching, rate limiting, and distributed coordination
- Enterprise SSO, authorization policies, tenant isolation, and audit storage
- Centralized telemetry and high-volume analytics, potentially in ClickHouse
- Deployment automation for Kubernetes or OpenShift

These items are architectural direction only; they are not prerequisites for
running or presenting the current demo.
