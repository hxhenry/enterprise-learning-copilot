# Agentic AI Engineer JD Alignment

## Positioning

Enterprise Learning Copilot is strongest as evidence of the role's **LLM + UI
+ experience layer** combination. It connects model-driven orchestration to
validated APIs, streamed state, reusable React components, and an explicit
human approval boundary.

It should be presented as a focused integration demo using fictional,
process-local data—not as a complete enterprise learning platform or deployed
production system.

## Required skills

| Job requirement | Evidence in this branch | Alignment |
| --- | --- | --- |
| TypeScript/Python for LLM and agent development | LangGraph state/nodes in [`lib/agents/graph.ts`](../lib/agents/graph.ts), structured routing in [`lib/agents/router.ts`](../lib/agents/router.ts), and model/tool streaming in [`lib/agents/run-streaming-agent.ts`](../lib/agents/run-streaming-agent.ts) | **Strong in TypeScript.** Python is not used, and the requirement allows either language. |
| React + TypeScript + Next.js | Typed client state and stream handling in [`components/chat/chat-container.tsx`](../components/chat/chat-container.tsx), trusted experience components under `components/learning`, and Next.js App Router handlers under `app/api` | **Strong.** This is the candidate's existing frontend strength applied to AI. |
| Streaming UI using WebSockets or SSE | Typed protocol-v1 SSE is emitted by [`app/api/chat/route.ts`](../app/api/chat/route.ts) and validated/consumed by [`lib/streaming/agent-event-stream.ts`](../lib/streaming/agent-event-stream.ts) | **Strong via SSE.** WebSockets are unnecessary for the predominantly server-to-browser response flow. |
| API-driven UI and component development | Server emits allow-listed experience data from [`lib/schemas/events.ts`](../lib/schemas/events.ts); [`experience-block-renderer.tsx`](../components/agents/experience-block-renderer.tsx) maps it to trusted React components | **Strong.** The model cannot generate arbitrary JSX. |
| LangChain, LangGraph, Google Agent SDK, or AutoGen | LangGraph controls routing, state, conditional edges, checkpoints, and interrupt/resume; LangChain handles document splitting and vector retrieval | **Strong in LangGraph/LangChain.** Other listed SDKs are alternatives, not cumulative requirements. |

## Preferred skills

| Preferred area | Evidence in this branch | Alignment |
| --- | --- | --- |
| RAG | Local Markdown, LangChain splitting, OpenAI embeddings, memory vector search, retrieved passages, citation IDs, and source cards in [`lib/rag/course-knowledge.ts`](../lib/rag/course-knowledge.ts) and [`lib/tools/rag-tools.ts`](../lib/tools/rag-tools.ts) | **Implemented for the demo.** The index is process-local and the corpus is intentionally small. |
| Prompt engineering | Separate router, tutor, certification, and analytics instructions in [`lib/prompts/learning-copilot.ts`](../lib/prompts/learning-copilot.ts), including tool rules and grounded-answer constraints | **Implemented and inspectable.** Prompt evaluation/version management is future work. |
| Tool calling | Zod-validated tools under `lib/tools`; deterministic repository results; per-agent tool allow-lists; activity events streamed to the UI | **Implemented.** Read tools are model-callable; enrollment stays server-controlled. |
| ClickHouse | No runtime integration | **Roadmap only** for high-volume agent/product analytics if justified. |
| MongoDB | No runtime integration | **Roadmap only** as one possible persistent business or vector-search adapter. |
| Redis | No runtime integration | **Roadmap only** for caching, rate limiting, or distributed coordination. |
| OpenShift / Kubernetes | No manifests or deployed cluster integration | **Roadmap only** for a future containerized deployment. |

## Experience signals

| Experience expectation | Repository evidence | Honest interpretation |
| --- | --- | --- |
| Built a chatbot/copilot or agent workflow | Complete chat-to-router-to-specialist-to-tool-to-stream flow, plus a separate approval resume path | The branch demonstrates a working copilot integration workflow. |
| Reusable UI components/SDKs | Certification, analytics, source, activity, and approval components consume a discriminated event/data contract | Strong reusable-component evidence; it is an application component system, not a separately published SDK. |
| Hands-on RAG and tool-based agents | RAG and domain tools execute inside distinct specialist agents and are covered by tool/graph tests | Demonstrated directly in code and in the four guided scenarios. |
| 3+ years engineering | Not provable from a repository | Discuss the candidate's actual frontend engineering history separately; do not ask the demo to establish tenure. |

## Strongest interview narrative

The candidate's differentiator is not claiming deep infrastructure experience
after a short AI learning period. It is showing how established frontend and
TypeScript engineering skills transfer into agent products:

1. **Experience design:** the user sees routing, tool work, structured results,
   cancellation, approval, and completion—not an unexplained loading spinner.
2. **Bounded model authority:** the model routes and explains, while application
   code validates schemas, owns data access, and controls writes.
3. **End-to-end typing:** TypeScript contracts connect server events, browser
   state, and React renderers.
4. **Stateful workflow:** LangGraph makes branches, checkpoints, and approval
   interrupt/resume explicit.
5. **Testability:** model, graph, repositories, clock, IDs, and checkpointer have
   dependency seams for deterministic tests.
6. **Production awareness:** limitations are named clearly and map to specific
   replacement boundaries rather than vague claims of being production ready.

Suggested 60-second summary:

> I approached the assignment from the experience layer inward. I built a
> React and Next.js copilot that streams a typed event protocol rather than only
> text. LangGraph routes requests among three specialist agents, and validated
> tools provide deterministic learning and analytics data. LangChain RAG grounds
> internal-document answers, while an enrollment request uses interrupt/resume
> so the model cannot perform the write directly. The branch is intentionally a
> memory-only integration demo, but repository and protocol boundaries make the
> production evolution explicit and testable.

## Architecture decisions to defend

### Why specialist agents?

Tutor, certification, and analytics requests have different instructions,
tools, data boundaries, and output experiences. A small registry makes those
responsibilities visible without pretending the system needs dozens of agents.

### Why a graph instead of one route-level prompt?

Conditional routing, workflow state, a human interrupt, and resume behavior are
first-class graph concerns. The route remains responsible for HTTP and
streaming rather than absorbing the business workflow.

### Why tools for progress and analytics?

Percentages, course completion, and business metrics should come from
deterministic records. The LLM interprets and communicates the result instead of
acting as the source of truth.

### Why not make enrollment a write tool?

A model-callable write could execute before the user understands the action.
The server-controlled interrupt produces a visible approval request and binds
the resume decision to the actor, thread, and action ID.

### Why memory only?

The branch optimizes for a zero-infrastructure presentation and for learning
the core AI/UI flow. Memory is an explicit limitation, not hidden production
persistence. Durable storage is a clear future adapter rather than an inactive
dependency in the interview build.

## Gaps and future plan

For production, discuss gaps in terms of requirements and boundaries:

- Replace the fixed demo actor with enterprise SSO and server-verified claims.
- Replace `MemorySaver` and mock repositories with durable, transactional
  adapters; PostgreSQL is one option.
- Add shared idempotency and coordination for multiple application instances;
  Redis may help for bounded coordination concerns but should not replace the
  authoritative transaction store.
- Add tenant/document access filtering and a persistent retrieval system, such
  as pgvector, MongoDB Atlas Vector Search, Redis Vector Search, or a specialist
  vector database.
- Export logs and traces; consider ClickHouse only for appropriate event volume
  and query patterns.
- Add rate limiting, secrets management, background jobs, deployment probes,
  and autoscaling before Kubernetes or OpenShift rollout.

These are future decisions. None of the named infrastructure technologies is
connected in the current demo.

## Recommended preparation priority

Before the interview, be able to trace these two flows without opening the
code:

```text
Normal answer:
React → /api/chat → LangGraph router → specialist → tool/RAG → SSE → React

Write request:
React → /api/chat → interrupt → approval card → /api/chat/approval
      → Command({ resume }) → validated in-memory write → SSE → React
```

Then be ready to distinguish:

- Model reasoning from deterministic business logic
- SSE transport from the typed event protocol
- Retrieved evidence from generated prose
- Presentation-ready from production-ready
- Process-local idempotency from distributed exactly-once execution
