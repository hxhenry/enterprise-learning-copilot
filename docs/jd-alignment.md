# Agentic AI Engineer JD Alignment

## Reading this evidence map

This matrix maps the supplied Agentic AI Engineer job description to concrete
repository evidence. Status has one of three meanings:

- **Implemented**: working code and tests exist in the current demo scope.
- **Partial**: a meaningful integration seam exists, but the full enterprise or
  reusable-product capability does not.
- **Roadmap**: architecture direction only; no current implementation claim.

The repository cannot establish years of professional experience. That must be
supported by employment history and interview examples rather than source code.

## Required skills

| JD capability | Status | Repository evidence | Honest boundary |
| --- | --- | --- | --- |
| TypeScript/Python for LLM and agent development | **Implemented** through TypeScript | [LangGraph workflow](../lib/agents/graph.ts), [agent runner](../lib/agents/run-streaming-agent.ts), [prompts](../lib/prompts/learning-copilot.ts) | This project is TypeScript-only; it is not evidence of Python implementation. |
| React + TypeScript + Next.js | **Implemented** | [App Router page](../app/page.tsx), [chat container](../components/chat/chat-container.tsx), [experience renderer](../components/agents/experience-block-renderer.tsx) | One application, not a published component library. |
| Streaming UI with WebSockets or SSE | **Implemented** with SSE | [Chat route](../app/api/chat/route.ts), [approval route](../app/api/chat/approval/route.ts), [SSE encoder and consumer](../lib/streaming/agent-event-stream.ts) | Incremental text deltas over SSE; no WebSocket transport. |
| API-driven UI and component development | **Implemented** | [Protocol-v1 events](../lib/schemas/events.ts), [stream consumer](../components/chat/chat-container.tsx), [typed learning components](../components/learning) | Components are trusted internal application components, not model-generated JSX. |
| LangChain/LangGraph or another agent SDK | **Implemented** with LangChain and LangGraph | [Graph state and interrupts](../lib/agents/graph.ts), [RAG pipeline](../lib/rag/course-knowledge.ts), [runtime composition](../lib/runtime/learning-runtime.ts) | No Google Agent SDK or AutoGen implementation is claimed. |

## Preferred skills

| JD capability | Status | Repository evidence | Honest boundary |
| --- | --- | --- | --- |
| Retrieval-augmented generation | **Implemented** at demo scope | [Document ingestion and retrieval](../lib/rag/course-knowledge.ts), [RAG tool](../lib/tools/rag-tools.ts), [fictional source documents](../data/documents) | Three Markdown documents, OpenAI embeddings, and an in-memory vector store; no persistent ingestion service, ACL filtering, or RAG evaluation suite. |
| Prompt engineering | **Implemented** | [Specialist and router prompts](../lib/prompts/learning-copilot.ts), [structured router output](../lib/agents/router.ts) | Routing output is schema-validated and behavior is tested, but there is no production prompt registry, offline quality benchmark, or experiment platform. |
| Tool calling | **Implemented** | [Certification tools](../lib/tools/certification-tools.ts), [analytics tool](../lib/tools/analytics-tools.ts), [RAG tool](../lib/tools/rag-tools.ts) | Zod-validated read tools are model-callable. Enrollment is intentionally a server-owned approval workflow rather than an LLM write tool. |
| PostgreSQL persistence | **Implemented** for selected state | [Runtime adapter](../lib/runtime/learning-runtime.ts), [enrollment repository](../lib/repositories/postgres-enrollment-repository.ts), [migrations](../lib/database/migrations.ts), [readiness](../lib/database/postgres.ts) | Checkpoints and enrollment writes are durable; learning, analytics, and retrieval data remain in memory. |
| Redis | **Roadmap** | [Production architecture](architecture.md#13-redis-usage) | No Redis client, cache, limiter, queue, or lock is implemented. PostgreSQL advisory locks currently coordinate durable workflows. |
| MongoDB | **Roadmap** | [Vector-store options](architecture.md#6-retrieval-augmented-generation) | Listed as one possible retrieval technology only. |
| ClickHouse | **Roadmap** | [Observability direction](architecture.md#18-observability) | No ClickHouse schema, client, ingestion, or query path exists. |
| Kubernetes/OpenShift | **Roadmap** | [Deployment direction](architecture.md#19-kubernetes-and-openshift-deployment) | No manifests, Helm chart, operators, probes, policies, or cluster deployment exist. |

## Experience expectations

| JD expectation | Status | Repository evidence | Honest boundary |
| --- | --- | --- | --- |
| Three or more years of engineering | **Partial** as repository evidence | The linear milestone history demonstrates engineering decisions and iteration. | Years of experience must come from the candidate's résumé; do not infer tenure from commit volume or dates. |
| Built a chatbot/copilot or agent workflow | **Implemented** | [Chat experience](../components/chat/chat-container.tsx), [three-agent registry](../lib/agents/registry.ts), [LangGraph workflow](../lib/agents/graph.ts) | This is an integration demo using fictional data, not a deployed production customer system. |
| Reusable UI components or SDKs | **Partial** | [Typed experience renderer](../components/agents/experience-block-renderer.tsx), [learning cards](../components/learning), [event contract](../lib/schemas/events.ts) | Reusable within the app; no versioned external SDK, package, documentation portal, or downstream consumer. |
| Hands-on RAG and tool-based agents | **Implemented** | [RAG pipeline](../lib/rag/course-knowledge.ts), [specialized tools](../lib/tools), [streaming agent runner](../lib/agents/run-streaming-agent.ts) | Production retrieval operations, access filtering, evaluation, and enterprise data integration remain future work. |

## Thirty-second interview summary

> I built a TypeScript and Next.js enterprise learning copilot around LangGraph
> and LangChain. The backend routes requests to three specialized agents, uses
> Zod-validated tools and in-memory RAG, and streams a versioned SSE event
> protocol to trusted React components. Enrollment is separated from model tool
> calling and requires a LangGraph human-approval interrupt. The optional
> PostgreSQL runtime adds durable checkpoints, transactional idempotent
> enrollment writes, explicit migrations and readiness, and cross-instance
> workflow locking. I present it as a pre-production integration demo because
> SSO, tenant-aware authorization, persistent retrieval, centralized telemetry,
> and deployment infrastructure are deliberately still roadmap work.

## Interview talking points

### Why SSE instead of WebSockets?

The dominant path is server-to-browser event delivery. SSE preserves normal
HTTP request semantics, works with streaming `Response` bodies, and keeps
approval decisions as explicit POST requests. WebSockets would be worth adding
only if the product required sustained bidirectional events or client-to-server
messages on the same connection.

### Why a typed event protocol?

Raw model text is insufficient for agent selection, tool progress, source
cards, approvals, and stable errors. Every envelope carries a protocol version,
sequence, timestamp, request ID, agent-run ID, and thread ID. The browser rejects
invalid identity, out-of-order events, events after termination, and truncated
streams. React renders only allow-listed block types.

### Why LangGraph?

The approval workflow needs explicit state, interruption, checkpointing, and
resume semantics. Those requirements are clearer as graph nodes and conditional
edges than as one long prompt or an ad hoc chain of route-handler branches.

### How is an LLM-triggered write made safer?

The model never receives an enrollment write tool. The server owns actor
identity and the action ID, checks permission and ownership, pauses at an
approval interrupt, validates the resumed decision, and invokes the repository
only after approval. This is a strong demo boundary, while real authentication,
tenant policy, and durable audit records remain necessary for production.

### What happens if the process crashes between the write and checkpoint?

The enrollment and LangGraph checkpoint use separate transactions. A replay can
reach the execute node again, but the durable action claim and unique enrollment
constraint turn it into a no-op instead of a duplicate. This is idempotent
recovery, not a distributed transaction or a universal exactly-once guarantee.

### Why separate PostgreSQL pools?

Session advisory locks can hold connections for the duration of a workflow. A
separate bounded lock pool prevents those sessions from consuming all
checkpoint and repository capacity. Capacity planning must include both pool
limits per application process.

### Why explicit migrations and readiness?

Runtime schema creation hides deployment races and can silently change data at
request time. The migration command serializes the application and checkpointer
migration batch, records application checksums, and then verifies the expected
history. PostgreSQL selection fails instead of falling back to memory, making a
misconfigured deployment visible.

### How was the integration tested?

The quality gate covers linting, type checking, unit/component/route tests,
coverage thresholds, and a production build. The persistence suite can use an
ephemeral PGlite-compatible server locally, while CI also runs against a pinned
real PostgreSQL service for behavior that requires separate sessions.

## Honest production roadmap

Roadmap items are ordered by risk reduction rather than by keyword coverage.

### Stage 1 — Identity, authorization, and data boundaries

- Integrate OIDC/enterprise SSO and validate server-side sessions or tokens.
- Enforce permissions at every repository and tool boundary, not only the
  enrollment path.
- Add tenant-aware schemas or row-level security and document-access filtering
  before retrieval.
- Persist append-only audit events for approvals and sensitive tool use.

### Stage 2 — Production retrieval and evaluation

- Add a persistent vector store and controlled document-ingestion pipeline.
- Preserve source versions, ACL metadata, deletion, and re-embedding workflows.
- Add retrieval relevance, groundedness, citation, prompt-regression, and tool
  selection evaluations.
- Treat retrieved documents as untrusted input and test prompt-injection
  defenses.

### Stage 3 — Reliability and operations

- Move PostgreSQL to a managed service with backups, point-in-time recovery,
  credential rotation, migration promotion, and disaster-recovery exercises.
- Add rate limits, request budgets, backpressure, cancellation propagation,
  retry policies, circuit breakers, and provider-failure handling.
- Export logs, metrics, and traces through OpenTelemetry; define SLOs and alerts.
- Run stream-concurrency, pool-capacity, failure-injection, and recovery tests.

### Stage 4 — Platform deployment and scale-specific services

- Add container hardening and Kubernetes/OpenShift manifests only when the
  target platform is selected, including probes, autoscaling, secrets, network
  policies, and rollout/rollback procedures.
- Introduce queues and workers for ingestion, re-embedding, reports, and other
  slow or retryable work.
- Evaluate Redis for rate limiting or caching, ClickHouse for high-volume event
  analytics, and MongoDB/vector alternatives only when concrete workload and
  operational requirements justify them.

This ordering avoids presenting technology names as implemented experience and
keeps PostgreSQL authoritative for enrollment transactions.
