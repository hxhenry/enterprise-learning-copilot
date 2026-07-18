# Enterprise Learning Copilot Architecture

## 1. Purpose and scope

Enterprise Learning Copilot is a memory-only integration demo for an Agentic
AI Engineer role focused on the LLM, UI, and experience layers. It demonstrates
how a TypeScript application can combine model reasoning with deterministic
business operations and trusted React components.

This document distinguishes two scopes:

- **Implemented now:** the behavior that can be run and tested on this branch.
- **Production roadmap:** possible infrastructure and controls for a future
  deployment. Roadmap items are not implemented claims.

## 2. Implemented architecture

```text
Browser
  React chat, guided scenarios, activity timeline,
  trusted experience blocks, approval controls
                         |
                         | POST + streamed response
                         v
Next.js route handlers
  request validation, demo actor, SSE envelope,
  cancellation, structured console logs
                         |
                         v
LangGraph workflow
  state, model-assisted routing, conditional edges,
  checkpoints, interrupt and resume
                         |
            +------------+-------------+
            |            |             |
            v            v             v
       Tutor Agent  Certification  Analytics Agent
            |            Agent            |
            |            |                |
            +------------+----------------+
                         |
                  Validated tools
                         |
       +-----------------+------------------+
       |                 |                  |
       v                 v                  v
 Local Markdown    Fictional learning   Fictional analytics
 + memory index    + enrollment data       data
```

The runtime is entirely process-local apart from OpenAI model and embedding
requests. It does not connect to a business database, cache, analytics store,
message queue, or container platform.

## 3. End-to-end request flow

A normal chat request follows this sequence:

```text
1. User submits a message in ChatContainer.
2. Browser POSTs { message, threadId } to /api/chat.
3. Route validates the body and creates request/run correlation IDs.
4. LangGraph invokes the router node.
5. Router returns a validated agent ID, request kind, and reason.
6. A conditional edge selects one specialist workflow.
7. The specialist may call one or more validated tools.
8. Status, tool, experience, and token events stream over SSE.
9. Browser validates the event envelope and updates trusted React state.
10. A done or error event explicitly terminates the response.
```

The chat response is a streaming `fetch()` response. SSE is a good fit because
the long-lived traffic is predominantly server-to-browser; new messages and
approval decisions remain ordinary HTTP POST requests.

## 4. LangGraph orchestration

The graph state contains the current user message, bounded conversation
history, selected agent, routing reason, request kind, pending enrollment,
approval status, resolved action ID, and final answer.

The standard workflow is:

```text
START
  |
  v
Router
  |
  +--------------------------+
  |             |            |
  v             v            v
Tutor      Certification  Analytics
  |             |            |
  +-------------+------------+
                |
               END
```

The router uses model output constrained to the registered agent IDs and known
request kinds. LangGraph conditional edges—not arbitrary model-generated
code—determine which node runs.

The registry currently defines three agents:

| Agent | Responsibility | Available tools |
| --- | --- | --- |
| Course Tutor | Technical and policy questions grounded in local documents | `searchCourseKnowledge` |
| Certification | User progress, requirements, remaining courses, and plans | learning repository tools plus `searchCourseKnowledge` |
| Business Analytics | Department completion, overdue employees, and risk | `getDepartmentCertificationStats` |

## 5. Tool boundary

The LLM may decide when an allowed read tool is useful, but it does not own the
tool implementation or authoritative business data.

```text
Model selects an allow-listed tool
              |
              v
Zod validates tool arguments
              |
              v
Tool calls an asynchronous repository contract
              |
              v
Deterministic data/result returns to the model
              |
              v
Model explains the result to the user
```

Learning, analytics, enrollment, and knowledge concerns are exposed through
repository interfaces. Their current adapters wrap fictional, in-memory data.
These contracts are useful test and replacement seams; they do not imply that
a durable adapter exists on this branch.

## 6. Streaming and experience protocol

Every server event uses a runtime-validated protocol-v1 envelope:

```text
protocolVersion
sequence
emittedAt
requestId
agentRunId
threadId
payload
```

Payload types include:

- Status updates
- Agent selection and routing reason
- Tool start and result activity
- Structured experience blocks
- Text tokens
- Approval required and approval resolved events
- Explicit `done` and `error` terminal events

The browser rejects malformed events, incorrect sequence numbers, mismatched
request/thread identity, a changed run ID, events after termination, and a
stream that ends without a terminal event.

The model never returns executable JSX. The server emits an allow-listed data
union, and the experience-block renderer maps it to trusted React components:

- Certification progress card
- Department analytics summary
- Retrieved source list
- Agent and tool activity timeline
- Enrollment approval card

This separates generative language from UI control and keeps component behavior
owned by the application.

## 7. Retrieval-augmented generation

The implemented RAG pipeline is:

```text
Markdown under data/documents
              |
              v
LangChain Document objects
              |
              v
RecursiveCharacterTextSplitter
  (800-character chunks, 120 overlap)
              |
              v
OpenAI embeddings
              |
              v
LangChain MemoryVectorStore
              |
              v
Scored semantic similarity search
              |
              v
Minimum-relevance filter
              |
              v
Relevant passages + run-scoped citation IDs
              |
              v
Model answer with inline citations
              |
              v
Cited-ID validation + structured source block
```

The vector index is built lazily and cached for the life of the process. The
available sources cover cloud-security fundamentals, identity and access
management, and certification policy.

The retriever discards candidates below a named cosine-similarity threshold. If
none remain, the tool reports that the internal corpus does not cover the topic
and instructs the agent to label any general explanation as model knowledge.
Retrieved passages are held for the current agent run; after generation, only
valid citation IDs that actually appear in the answer are rendered as source
evidence.

These checks prevent nearest-but-irrelevant passages from automatically
becoming citations, but they do not prove claim-level entailment. A production
system should calibrate thresholds against a larger evaluation set and add
tenant access filters, reranking, and claim-to-passage verification.

## 8. Human approval workflow

Enrollment is kept outside the model-callable write-tool set. The server owns
course resolution, permission checks, action IDs, approval validation, and the
write operation.

```text
Enrollment request
        |
        v
Router marks request kind as enrollment
        |
        v
Server resolves the course and creates an action ID
        |
        v
LangGraph interrupt saves pending state in MemorySaver
        |
        v
Browser renders trusted approval controls
        |
        +-------------------+
        |                   |
     Approve              Reject
        |                   |
        v                   v
POST /api/chat/approval   No write
        |                   |
        +---------+---------+
                  |
                  v
Command({ resume }) validates actor + action
                  |
                  v
Checkpoint records one terminal result
```

The demo actor is currently a fixed server-side identity with explicit
permissions. User identity, roles, and permissions are never accepted from the
browser body. Real authentication and enterprise authorization remain future
work.

Within one Node.js process, approval resumes for the same thread/action key are
serialized. Checkpoint state records the resolved action ID, and the enrollment
adapter checks action and user/course duplicates. This makes retries safe in
the demo process. It is not a claim of distributed exactly-once execution.

## 9. Memory and data lifecycle

The current stores are:

| Concern | Current implementation | Lifecycle |
| --- | --- | --- |
| Learning catalog and progress | Fictional TypeScript data | Recreated with the process |
| Department analytics | Fictional TypeScript data | Recreated with the process |
| Enrollment records | In-memory adapter | Lost on restart |
| Graph checkpoints | LangGraph `MemorySaver` | Lost on restart |
| Knowledge sources | Local Markdown files | Persist on disk |
| Vector index | `MemoryVectorStore` | Rebuilt after restart when first used |
| Logs | Structured JSON to stdout/stderr | Retained only if the runtime captures them |

The browser keeps the active conversation thread ID in component memory.
**New conversation** clears browser conversation state and creates a new
thread, but it does not erase process-level enrollment records. Reloading the
page also creates a new browser thread, while restarting the server clears all
mutable process-local state.

## 10. Configuration and failure behavior

Required server configuration is parsed with Zod. The Next.js instrumentation
hook validates it at startup, and the chat boundary validates it again before
starting the stream. Missing OpenAI configuration produces a stable public
configuration error rather than a partially executed workflow.

Model calls have a total timeout, per-step timeout, tool-step limit, output
token limit, and browser cancellation signal. Public stream errors use stable
codes while detailed failures remain in structured server logs.

## 11. Observability

The server emits JSON logs correlated by request ID, agent-run ID, thread ID,
and operation. Logged lifecycle information includes:

- HTTP request start, completion, duration, and outcome
- Router selection, request kind, and latency
- Agent start, model steps, tool names, usage, first-token latency, and duration
- Approval action and decision
- Normalized error information

This is console observability for a demo. No centralized log platform,
distributed tracing backend, or durable audit store is connected.

## 12. Test architecture

The code exposes dependency seams for the model, router, graph runner, clock,
ID generator, checkpointer, and repositories. The test suite covers:

- Native Next.js chat and approval route handlers
- SSE encoding, parsing, identity, ordering, and termination
- Real LangGraph interrupt/resume behavior with an isolated checkpointer
- Deterministic model and AI SDK tool-call behavior
- Agent routing and graph integration
- Repository-backed tool contracts
- Authorization and request validation
- Approval replay, duplicate prevention, and process-local serialization
- React approval and experience behavior

`npm run check` runs linting, type-checking, coverage thresholds, and a
production build.

## 13. Production roadmap (not implemented)

A production evolution would replace process-local boundaries incrementally:

```text
Browser / React
      |
API gateway, authentication, rate limiting
      |
Horizontally scaled web and orchestration workloads
      |
      +-------------------+-------------------+
      |                   |                   |
Durable state       Retrieval service    Telemetry pipeline
      |                   |                   |
PostgreSQL or       pgvector, MongoDB,    Central logs/traces,
equivalent          Redis, or specialist  ClickHouse if justified
transaction store   vector database
      |
Distributed coordination / cache where needed
      |
Kubernetes or OpenShift deployment automation
```

Possible work includes:

- PostgreSQL-backed LangGraph checkpoints and transactional enrollment records
- Atomic idempotency and decision claims shared across application instances
- Redis for bounded caching, rate limiting, or distributed coordination
- Persistent vector search through PostgreSQL/pgvector, MongoDB Atlas Vector
  Search, Redis Vector Search, or a dedicated service
- Enterprise SSO, tenant isolation, document-level access control, and durable
  audit records
- Background queues for ingestion, re-embedding, reporting, and notifications
- OpenTelemetry traces and centralized logs; ClickHouse only when event volume
  and analytics access patterns justify it
- Kubernetes or OpenShift manifests, secrets integration, health probes,
  autoscaling, and deployment policies

Technology choices should follow actual scale, latency, compliance, and team
requirements rather than being added solely to expand the stack.

## 14. Current limitations

The demo does not include:

- Real SSO or external identity verification
- Durable checkpoints or business records
- Distributed locks or multi-instance coordination
- Persistent vector storage or document ingestion pipeline
- Tenant-aware retrieval authorization
- Production rate limiting, queues, audit storage, or centralized telemetry
- PostgreSQL, Redis, MongoDB, ClickHouse, Kubernetes, or OpenShift runtime
  integration
- Real employees, courses, analytics, or policies

Those limitations are intentional: the branch focuses on making the complete
agent, API, streaming, and React experience understandable and demonstrable.
