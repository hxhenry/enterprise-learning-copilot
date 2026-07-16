# Enterprise Learning Copilot

A presentation-ready, pre-production integration demo for an enterprise
learning copilot. It combines a typed React experience layer,
protocol-versioned SSE streaming, specialized agents, RAG, tool calling, human
approval, and optional durable PostgreSQL workflow state.

Current presentation milestone: `v0.4.0` — a guided demonstration and honest JD
evidence map for the `v0.3.0` durable runtime baseline.

This repository demonstrates an end-to-end integration boundary; it is not a
deployed learning-management system. The demo uses a fixed server-controlled
actor and fictional learning data. PostgreSQL can persist LangGraph checkpoints
and enrollment writes, while learning records, analytics, and the RAG vector
store remain in memory.

## Start here

- [Five-minute demo guide](docs/demo-guide.md)
- [Agentic AI Engineer JD alignment](docs/jd-alignment.md)
- [Technical architecture](docs/architecture.md)
- [Milestone changelog](CHANGELOG.md)

## Prerequisites

- Node.js 22 and npm
- An OpenAI API key with access to the configured chat and embedding models
- Docker with Compose only when demonstrating durable PostgreSQL persistence

Verify that `OPENAI_MODEL` and `OPENAI_EMBEDDING_MODEL` in `.env.local` are
available to the API account used for the demo. Do not commit `.env.local`.

## Run with the in-memory backend

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`, keep `PERSISTENCE_BACKEND=memory`, then
start the zero-external-database backend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Check server configuration and the selected persistence backend:

```bash
curl -fsS http://localhost:3000/api/health
```

The readiness endpoint does not call the OpenAI model or embedding service. Run
one preflight prompt before presenting to verify provider access.

## Run with durable PostgreSQL persistence

Start the pinned local PostgreSQL service:

```bash
npm run db:up
```

Wait until `docker compose ps` reports the service as healthy.

Run the explicit database migrations before starting the application:

```bash
PERSISTENCE_BACKEND=postgres \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/enterprise_learning \
npm run db:migrate
```

The migration command serializes the complete application and LangGraph
checkpoint migration batch with a database advisory lock, so overlapping
deployment jobs cannot race.

Set the same persistence values in `.env.local`, then run `npm run dev`.
The runtime never creates schemas automatically and never falls back to memory
when PostgreSQL is selected.

The PostgreSQL runtime uses separate bounded pools for data operations and
session advisory locks. `POSTGRES_POOL_MAX` controls checkpoint/repository
connections and `POSTGRES_WORKFLOW_LOCK_POOL_MAX` controls concurrent lock
sessions; plan database capacity for the sum of both limits per app process.

`GET /api/health` returns `200` only after the selected persistence backend
passes its readiness check; an unmigrated or unavailable PostgreSQL schema
returns `503`.

Stop the local service with `npm run db:down`.

## Reset the demo

Select **New conversation** to clear the visible transcript and use a new
browser thread. This does not delete earlier server checkpoints or enrollment
records. The control stays disabled until any active stream or approval is
resolved. A full page reload also starts a new browser thread.

For a clean in-memory run, fully stop and restart the Next.js process, then
select **New conversation** or reload the page.

`npm run db:down` stops PostgreSQL but preserves its named volume. To remove all
local PostgreSQL demo data, use the following destructive reset, then migrate
the fresh database again:

```bash
docker compose down -v
npm run db:up
PERSISTENCE_BACKEND=postgres \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/enterprise_learning \
npm run db:migrate
```

Wait for the fresh service to become healthy before running the migration. Use
that command only for the dedicated local demo database.

## Verification

Run the unit, component, route, and in-memory integration gate:

```bash
npm run check
```

Run the durable integration suite locally against an ephemeral PostgreSQL-compatible
PGlite server (no Docker required):

```bash
npm run test:postgres:local
```

PGlite intentionally uses one PostgreSQL session behind its socket adapter, so
the local suite records that limitation instead of claiming to validate
cross-session advisory locks. CI includes a real-PostgreSQL job that runs the
two-coordinator race test.

Run that suite against a real PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://user:password@host/database npm run test:postgres
```

GitHub Actions runs both `npm run check` and the durable suite against a pinned
PostgreSQL 18 service. See [CHANGELOG.md](CHANGELOG.md) for milestone details.

## Scope and architecture

See [docs/architecture.md](docs/architecture.md) for the workflow, streaming
protocol, approval boundary, persistence model, security controls, production
scaling direction, and explicit demo limitations.
