# Changelog

## 0.3.0 - 2026-07-16

### Added

- Optional PostgreSQL persistence for LangGraph checkpoints and approved course
  enrollments, with separate bounded data and workflow-lock connection pools so
  lock holders cannot starve checkpoint or repository queries.
- Explicit, checksum-validated application migrations plus the official
  LangGraph PostgreSQL checkpointer migrations.
- Transactional enrollment action claims, unique enrollment constraints, and
  deterministic idempotent replay.
- Actor-scoped checkpoint identifiers so client thread IDs cannot collide
  across authenticated users.
- PostgreSQL advisory-lock workflow coordination shared by chat and approval
  requests across application instances.
- Readiness reporting that verifies the selected persistence backend, required
  relations, application migration checksums, and checkpoint migration level.
- A zero-install PGlite integration harness, pinned PostgreSQL Compose service,
  and real PostgreSQL GitHub Actions integration job.

### Changed

- Graph construction now requires an injected checkpointer and complete
  repository bundle instead of importing persistence singletons.
- Approval replay converges on the first durable terminal decision, including
  when a later request submits the opposite decision.
- PostgreSQL selection is explicit and fail-fast; runtime startup never runs
  migrations and never silently falls back to memory.

### Known limitations

- Learning, analytics, and knowledge retrieval adapters remain in memory. Only
  workflow checkpoints and enrollment writes are durable in this milestone.
- The demo authentication provider still supplies a fixed local actor; SSO and
  production authorization-policy integration remain future milestones.
- A workflow checkpoint and an enrollment write use separate database
  transactions. Crash recovery is safe through durable action claims and
  idempotent replay, rather than a distributed transaction.
- The inherited PostCSS advisory described in v0.2 remains open pending a safe
  stable Next.js upgrade.

## 0.2.0 - 2026-07-15

### Added

- Version 1 agent-event envelopes with sequence, timestamp, request, run, and
  thread metadata.
- Browser enforcement of ordered, request-bound event identity and explicit
  terminal events, including truncated-stream rejection.
- Stable public workflow error codes and retryability metadata.
- Fail-fast Node.js server configuration validation through Next.js
  instrumentation.
- Asynchronous repository contracts and in-memory adapters for learning,
  analytics, enrollment, and knowledge data.
- Dependency seams for deterministic model, graph, clock, ID, checkpoint, and
  repository integration tests.
- Native route-handler SSE tests, real LangGraph interrupt/resume tests, AI SDK
  mock-model tests, and tool contract tests.
- Idempotent approval replay with durable resolved-action state and exactly-once
  enrollment verification.
- Enforced coverage thresholds in the complete quality gate.

### Changed

- The browser and server now use the protocol-v1 event envelope instead of raw
  event payloads.
- The complete quality gate now includes type-checking and coverage.
- Vitest uses Vite's native TypeScript path resolution.
- The application uses system font stacks so production builds do not depend
  on downloading Google Fonts.

### Known limitations

- `npm audit --omit=dev` reports the PostCSS advisory inherited from the latest
  stable Next.js package. The [Next.js maintainers classify this copy as
  build-time only](https://github.com/vercel/next.js/issues/93234),
  and this project does not build untrusted CSS. Upgrade Next.js when a stable
  release carries PostCSS 8.5.10 or newer; do not accept npm's suggested Next 9
  downgrade.

## 0.1.0 - 2026-07-15

- Initial agentic learning demo with streaming chat, three specialized agents,
  RAG, structured experience components, memory, approval-gated enrollment,
  tests, and console observability.
