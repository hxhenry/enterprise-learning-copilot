# Changelog

## Unreleased - Presentation-ready v0.2

### Added

- A guided four-scenario presentation panel covering RAG tutoring,
  certification planning, analytics, and approval-gated enrollment.
- A clear memory-demo status indicator and a browser-side new-conversation
  control.
- Presentation, architecture, and job-description alignment guides.
- Approval activity in the agent timeline and live completion announcements.

### Changed

- Refined the page header, capability labels, responsive layout, learning
  cards, accessibility behavior, and presentation copy.
- Reframed the repository as a focused, memory-only AI integration demo.
- Separated implemented capabilities from the production roadmap; PostgreSQL,
  Redis, MongoDB, ClickHouse, Kubernetes, and OpenShift are future options, not
  current runtime dependencies.

### Scope

- All learning, analytics, enrollment, retrieval-index, and workflow state
  remains process-local.
- The new-conversation control resets browser conversation state but does not
  erase server-side in-memory enrollment records.

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
- Idempotent approval replay with checkpointed resolved-action state and
  duplicate-enrollment verification within the current process.
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
