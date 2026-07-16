# Enterprise Learning Copilot

A Next.js and LangGraph integration demo for an enterprise learning copilot.
It combines a typed React experience layer, protocol-versioned SSE streaming,
specialized agents, RAG, tool calling, human approval, and optional durable
PostgreSQL workflow state.

Current milestone: `v0.3.0` — durable workflow checkpoints, idempotent enrollment
writes, and cross-instance workflow serialization.

## Run the demo

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`, then start the default zero-dependency
memory backend:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run with durable PostgreSQL persistence

Start the pinned local PostgreSQL service:

```bash
npm run db:up
```

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

`GET /api/health` returns `200` only after the selected backend passes its
readiness check; an unmigrated or unavailable PostgreSQL schema returns `503`.

Stop the local service with `npm run db:down`.

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
cross-session advisory locks. The mandatory real-PostgreSQL CI job runs the
two-coordinator race test.

Run that suite against a real PostgreSQL database:

```bash
TEST_DATABASE_URL=postgresql://user:password@host/database npm run test:postgres
```

GitHub Actions runs both `npm run check` and the durable suite against a pinned
PostgreSQL 18 service. See [CHANGELOG.md](CHANGELOG.md) for milestone details.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the workflow, streaming
protocol, approval boundary, persistence model, security controls, production
scaling direction, and explicit demo limitations.
