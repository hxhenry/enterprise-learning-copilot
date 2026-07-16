# Five-Minute Demo Guide

## Purpose and scope

This guide presents Enterprise Learning Copilot as a presentation-ready,
pre-production integration demo. It demonstrates how a typed React experience,
SSE, LangGraph, LangChain retrieval, tool calling, human approval, and optional
PostgreSQL durability work together.

It does not demonstrate a production LMS, enterprise SSO, real employee data,
tenant isolation, a persistent vector database, centralized telemetry, or a
Kubernetes/OpenShift deployment.

The walkthrough is deterministic at the workflow-contract and fictional-data
level. A live LLM can still vary its wording, latency, exact tool ordering, and
the number of retrieved passages.

## Preflight

Use the PostgreSQL backend for the strongest version of the demonstration. The
[README](../README.md) contains complete startup and reset commands.

Before the interview or presentation:

1. Confirm Node.js 22, npm, Docker Compose, and the expected local port are
   available.
2. Confirm `.env.local` contains a working `OPENAI_API_KEY`, an accessible
   `OPENAI_MODEL`, and an accessible `OPENAI_EMBEDDING_MODEL`.
3. Start PostgreSQL, run the explicit migrations, and start the application.
4. Verify `curl -fsS http://localhost:3000/api/health` returns a ready response
   whose `persistence` value is `postgres`.
5. Run `npm run check` before the presentation. Run
   `npm run test:postgres:local` when demonstrating the durable integration
   gate without an external PostgreSQL test server.
6. Send the first RAG prompt once to confirm model and embedding access and warm
   the in-memory vector index. Then select **New conversation**.
7. Reset the PostgreSQL demo volume if the target course was enrolled during
   preflight.

The health endpoint validates configuration and the selected persistence
backend. It does not make a model or embedding request, so the live prompt
preflight is still required.

## Fixed demo facts

These values come from the fictional repository data and provide stable
checkpoints for the presentation:

| Fact | Expected value |
| --- | --- |
| Demo actor | Henry (`user-001`), Frontend Engineer, Engineering |
| Cloud Security Certification progress | 2 of 4 courses, 50% |
| Completed courses | Cloud Security Fundamentals; Identity and Access Management |
| Remaining courses | Secure Cloud Networking; Cloud Incident Response |
| Next required course | Secure Cloud Networking |
| Highest-risk department | Operations: 61% complete, 18 overdue |
| Other at-risk department | Engineering: 70% complete, 12 overdue |

The in-app **Guided walkthrough** presents the four scenarios below in the same
order. Selecting a scenario loads its exact prompt into the composer without
sending it, so the presenter controls the timing.

## Timed walkthrough

### 0:00–0:30 — Frame the demo

Say:

> This is a pre-production integration demo, not a production LMS. I built it
> to show the full LLM-to-experience boundary: specialized agents, typed SSE,
> trusted React components, retrieval and tools, approval-gated writes, and an
> optional durable PostgreSQL workflow.

Ask the audience to watch three layers in the UI: incremental answer text, the
agent/tool activity timeline, and typed experience components.

### 0:30–1:15 — Tutor RAG and citations

Send this exact prompt:

> Using our internal learning material, explain the principle of least privilege and cite your sources.

Expected evidence:

- The Tutor Agent is selected.
- `searchCourseKnowledge` appears in the activity timeline.
- The answer explains granting only the access required for a responsibility.
- A trusted source card includes the Identity and Access Management material.
- The response cites source identifiers returned by the retrieval tool.

Talking point: LangChain loads and chunks three fictional Markdown documents,
creates OpenAI embeddings, and performs similarity search in an in-memory vector
store. The tool returns structured passages and the server emits an allow-listed
source block; the model does not generate arbitrary React code.

### 1:15–2:05 — Certification tools and structured UI

Send this exact prompt:

> Show my progress toward the Cloud Security Certification and recommend what I should take next.

Expected evidence:

- The Certification Agent is selected.
- Certification progress tool activity is visible.
- The trusted progress card shows 50% completion.
- Cloud Security Fundamentals and Identity and Access Management are complete.
- Secure Cloud Networking and Cloud Incident Response remain.
- Secure Cloud Networking is the next required course.

Talking point: the percentage and course membership come from deterministic
repository logic. The LLM explains the result but does not calculate or invent
the authoritative progress record.

### 2:05–2:45 — Analytics agent and business component

Send this exact prompt:

> Compare certification completion across departments and identify the highest-risk department.

Expected evidence:

- The Business Analytics Agent is selected.
- The analytics tool and trusted summary component appear.
- Operations is highest risk at 61% completion with 18 overdue.
- Engineering is also marked at risk at 70% completion with 12 overdue.

Talking point: this demo reports fictional department aggregates. It does not
contain employee-level overdue records or a live ClickHouse analytics pipeline.

### 2:45–3:50 — Human approval and durable enrollment

Send this exact prompt:

> Enroll me in Secure Cloud Networking.

Expected evidence:

- The workflow resolves the course and pauses at a LangGraph interrupt.
- The UI displays a trusted approval card describing the write and its impact.
- The composer stays blocked until the pending action is resolved.
- After **Approve enrollment** is selected, the workflow resumes and confirms
  enrollment without creating a duplicate record.

Talking point: the model has no enrollment write tool. The server supplies the
actor, checks the enrollment permission and pending-action ownership, and only
executes the repository write after a matching approval decision. PostgreSQL
claims the action and writes the enrollment transactionally; unique constraints
make replay idempotent. This is duplicate prevention, not a distributed
exactly-once transaction across checkpoint and enrollment writes.

### 3:50–4:25 — Show readiness and the durable row

Show the readiness result:

```bash
curl -fsS http://localhost:3000/api/health
```

Optionally show the enrollment row in the dedicated local database:

```bash
docker compose exec -T postgres \
  psql -U postgres -d enterprise_learning \
  -c 'TABLE learning_copilot.course_enrollments;'
```

Talking point: runtime startup does not create schemas and PostgreSQL mode never
silently falls back to memory. Migrations are an explicit, checksum-validated
deployment step, and readiness verifies the expected application and LangGraph
migration history.

### 4:25–5:00 — Close with the engineering progression

Summarize the milestones:

- `v0.1`: end-to-end copilot, three agents, RAG, tools, structured UI, approval,
  tests, and structured console observability.
- `v0.2`: versioned integration contracts, browser stream validation,
  dependency injection, deterministic tests, and coverage gates.
- `v0.3`: optional PostgreSQL checkpoints and enrollment writes, explicit
  migrations/readiness, idempotent recovery, and cross-instance workflow
  serialization in PostgreSQL mode.
- `v0.4`: presentation, operating guidance, and evidence-based JD alignment.

Close with the highest-priority production gaps: real identity and authorization,
tenant-aware and ACL-filtered retrieval, persistent knowledge storage, durable
audit events, centralized telemetry, managed database operations, load testing,
and deployment hardening.

## Recovery during a live demo

| Symptom | Recovery |
| --- | --- |
| `/api/health` returns `503` in PostgreSQL mode | Confirm the container is healthy and rerun the explicit migration command. |
| The first RAG request is slow | Explain that the demo builds its in-memory vector index on first use; wait or retry after confirming embedding access. |
| A provider/model error appears | Verify the API key and configured model access, then retry the exact prompt. Readiness alone does not test the provider. |
| Enrollment says the course already exists | Use the destructive local PostgreSQL reset in the README, rerun migrations, and select **New conversation**. |
| An approval card blocks new messages | Approve or reject the pending action. **New conversation** stays disabled until the approval is resolved so the browser does not orphan the pending workflow. Do not reload: the current UI does not rehydrate older pending cards. |
| A response is stopped | The client marks active work as stopped. Start a fresh prompt after the request finishes cancelling. |
| The router chooses an unexpected agent | Select **New conversation**, retry the seeded prompt, and describe routing as model-selected within a runtime-validated agent contract. |

## Claims to use and avoid

Prefer these descriptions:

- “Presentation-ready pre-production integration demo”
- “Incremental text-delta streaming over SSE”
- “Trusted, allow-listed React experience components”
- “Idempotent duplicate prevention and replay”
- “PostgreSQL-mode cross-instance workflow serialization”
- “Server-controlled demo actor with an authorization seam”

Avoid claiming:

- Production readiness, enterprise deployment, SSO, tenant isolation, or full
  RBAC/ABAC enforcement
- Token-by-token delivery, WebSocket support, or a published UI SDK
- End-to-end exactly-once processing or one transaction spanning checkpoints and
  enrollment writes
- Persistent or production RAG, citation correctness guarantees, or
  hallucination elimination
- Real employee records or employee-level overdue analytics
- Implemented Redis, MongoDB, ClickHouse, Kubernetes, or OpenShift services
- Centralized observability, durable audit logs, OpenTelemetry, dashboards, or
  provider availability checks from `/api/health`

## Reset semantics

- **New conversation** clears the rendered transcript and assigns a new thread
  when the next request starts. It is disabled while a stream or approval is
  pending.
- Reloading the page also creates a new browser thread.
- Neither action deletes previous server checkpoints or durable enrollment
  records.
- Do not reload during a pending approval; the current browser does not provide
  a checkpoint inbox or transcript rehydration.
- A full Next.js process restart clears the in-memory checkpoint and enrollment
  adapters; a page reload does not guarantee that reset.
- `npm run db:down` preserves the PostgreSQL named volume.
- `docker compose down -v` is a destructive local reset. After it, start the
  service and rerun migrations before starting the app in PostgreSQL mode.
