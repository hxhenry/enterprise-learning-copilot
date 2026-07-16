# Changelog

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
