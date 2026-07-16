# Enterprise Learning Copilot Architecture

## 1. Overview

Enterprise Learning Copilot is a TypeScript-based multi-agent learning platform that supports:

- Technical course tutoring
- Certification progress tracking
- Personalized learning plans
- Business analytics
- Retrieval-augmented generation
- Human approval for write operations
- Stateful multi-turn conversations

## 2. Current demo architecture

```text
React Chat Experience
        |
        v
Next.js API Routes
        |
        v
LangGraph Workflow
        |
        +------------------------+
        |                        |
        v                        v
Agent Router        MemorySaver or PostgreSQL
        |                Checkpoints
        v
Specialized Agents
        |
        +-----------------------------+
        |              |              |
        v              v              v
Tutor Agent     Certification    Analytics Agent
                    Agent
        |              |              |
        v              v              v
LangChain RAG   Business Tools   Analytics Tool
        |              |              |
        v              v              v
Course Docs     Mock Learning    Mock Analytics
Vector Store         Data             Data
```

## 3. Experience layer

The frontend uses:

- React
- Next.js App Router
- TypeScript
- Tailwind CSS
- A custom typed protocol-v1 `AgentEvent` envelope
- Structured experience components
- Human approval components

The experience layer supports:

- Token-by-token streamed responses
- Agent-selection status
- Tool-execution timelines
- Certification progress cards
- Analytics tables
- RAG source cards
- Approval and rejection controls

Each streamed event carries:

- Protocol version
- Monotonic per-response sequence number
- ISO timestamp
- Request ID
- Agent-run ID
- Conversation thread ID
- A runtime-validated allow-listed payload

The frontend does not render arbitrary model-generated JSX.

The backend emits allow-listed structured blocks, and React maps each block to a trusted component.

## 4. AI and orchestration layer

The application uses:

- Vercel AI SDK for model streaming and tool execution
- LangGraph for stateful workflow orchestration
- LangChain for document processing and retrieval
- OpenAI as the current model and embedding provider

### LangGraph workflow

```text
START
  |
  v
Router
  |
  +---------------------------+
  |             |             |
  v             v             v
Tutor      Certification   Analytics
  |             |             |
  v             v             v
 END           END           END
```

Enrollment requests follow a separate workflow:

```text
Router
  |
  v
Prepare Enrollment
  |
  v
Human Approval Interrupt
  |
  +------------------+
  |                  |
Approve            Reject
  |                  |
  v                  v
Execute Write     Cancel Action
  |                  |
  v                  v
 END                END
```

## 5. Specialized agents

### Course Tutor Agent

Responsibilities:

- Explain technical concepts
- Answer course-content questions
- Answer internal policy questions
- Produce grounded responses with citations

Tools:

- `searchCourseKnowledge`

### Certification Agent

Responsibilities:

- Retrieve employee progress
- Retrieve certification requirements
- Identify completed and remaining courses
- Generate personalized learning plans
- Combine structured records with RAG

Tools:

- `getUserProfile`
- `getCompletedCourses`
- `getCertificationProgress`
- `getCertificationRequirements`
- `getCertificationCourses`
- `searchCourseKnowledge`

### Business Analytics Agent

Responsibilities:

- Compare department completion rates
- Identify overdue employees
- Determine risk status
- Explain business implications

Tools:

- `getDepartmentCertificationStats`

## 6. Retrieval-augmented generation

The RAG pipeline is:

```text
Markdown Documents
        |
        v
LangChain Document Loader
        |
        v
Recursive Text Splitter
        |
        v
OpenAI Embeddings
        |
        v
Memory Vector Store
        |
        v
Similarity Search
        |
        v
Relevant Passages
        |
        v
Grounded Answer with Citations
```

The current vector store is in memory and is appropriate only for the demo.

A production system should use a persistent vector database.

Possible options include:

- PostgreSQL with pgvector
- MongoDB Atlas Vector Search
- Redis Vector Search
- OpenSearch
- Pinecone
- Qdrant

## 7. Memory and persistence

The runtime has two explicit persistence modes:

- `memory` uses LangGraph `MemorySaver` and the in-memory enrollment adapter.
- `postgres` uses the official LangGraph `PostgresSaver` and the PostgreSQL
  enrollment adapter through a bounded data pool. Session advisory locks use a
  second bounded pool so lock holders cannot consume checkpoint/query capacity.

Checkpoints store:

- Conversation history
- Selected agent
- Routing decisions
- Pending enrollment
- Approval state
- Final workflow state

Conversation history is bounded to the latest turns to control:

- Token usage
- Cost
- Latency
- Context size

The memory backend remains useful for a zero-dependency UI demo, but restart
recovery requires PostgreSQL:

```text
PostgreSQL checkpoint
→ server or replica restart
→ resume the same pending approval
```

Client thread IDs are not used directly as checkpoint keys. The server derives
an actor-scoped identifier so two authenticated users cannot collide by choosing
the same client thread ID.

Migrations are an explicit deployment step. Runtime initialization validates
configuration and creates a pool, but it does not create or modify database
schemas. Selecting PostgreSQL with missing configuration or migrations fails;
there is no automatic memory fallback.

The migration command holds a database-wide deployment advisory lock across
both application migrations and the official checkpointer setup. Readiness then
checks the exact application migration IDs/checksums and expected checkpoint
migration history, rather than accepting table names alone.

Every graph invocation for an actor-scoped thread runs under the same workflow
coordinator. The memory backend uses a process-local keyed executor. PostgreSQL
uses a session advisory lock, so chat and approval requests serialize across
application replicas without holding a database transaction open while the
graph executes.

`POSTGRES_POOL_MAX` bounds checkpoint and repository connections;
`POSTGRES_WORKFLOW_LOCK_POOL_MAX` independently bounds long-lived advisory-lock
sessions. A process can therefore open at most the sum of those two configured
limits during normal runtime operation.

## 8. Human approval and write security

Write operations are separated from read operations.

Enrollment follows this process:

```text
User requests enrollment
        |
        v
Server resolves course
        |
        v
Permission check
        |
        v
LangGraph interrupt
        |
        v
Approval card
        |
        +----------------+
        |                |
     Approve           Reject
        |                |
        v                v
Execute write       No data change
```

The model cannot directly execute a write.

The server validates:

- Authenticated actor
- Required permission
- Action ownership
- Pending action ID
- Approval decision
- Duplicate enrollment
- Duplicate action execution

## 9. Current demo data stores

Learning records, analytics data, and the RAG vector store remain in memory.
Enrollment records and LangGraph checkpoints can run either in memory or in
PostgreSQL. These adapters sit behind asynchronous repository and checkpointer
contracts so persistence selection does not change graph node behavior.

The application accesses mock learning, analytics, enrollment, and knowledge
data through asynchronous repository contracts. The PostgreSQL enrollment
adapter claims every approval action ID and creates the enrollment in one
transaction. Unique action and `(user, course)` constraints make retries
deterministic and prevent duplicate records.

Approval completion clears the pending action and records the resolved action
ID in checkpoint state. A repeated decision can therefore return the durable
result without executing the enrollment write again. The browser accepts only
ordered protocol events whose request, agent-run, and thread identity remains
stable, and treats EOF without a terminal `done` or `error` event as a failed
stream.

The first terminal approval decision persisted in a checkpoint is canonical.
If another replica later submits the opposite decision, it acquires the same
thread lock, reads the terminal checkpoint, and returns that canonical result.
Approval events are buffered until the server validates the terminal state.

The enrollment transaction and the LangGraph checkpoint transaction are
separate. A crash between them can replay the execute node, but the durable
action claim makes that replay a no-op instead of a duplicate write. This is an
idempotent recovery model, not a distributed transaction.

Server configuration is validated through the Next.js instrumentation startup
hook and again at the request boundary. Missing model or selected persistence
configuration fails with a stable public error rather than reaching the model
or silently changing backend.

## 10. Production target architecture

```text
Browser / React
        |
        v
CDN + Web Application Firewall
        |
        v
API Gateway + Rate Limiter
        |
        v
Streaming Gateway
        |
        v
LangGraph Orchestration Workers
        |
        +-------------------------------+
        |               |               |
        v               v               v
Model Gateway     Tool Services    Retrieval Service
        |               |               |
        v               v               v
LLM Providers    Business APIs    Vector Database
        |
        +-----------------------------------------+
        |             |             |             |
        v             v             v             v
PostgreSQL       Redis Cache    Event Queue    ClickHouse
```

## 11. Scaling to 50 agents

The system should avoid a large hard-coded routing chain.

Each agent should be registered through configuration containing:

- Agent ID
- Name
- Description
- Domain
- Capabilities
- Allowed tools
- Required permissions
- Prompt version
- Model policy
- Enabled state
- Owner
- Service-level objective

Agents can be grouped by business domain:

- Learning
- Certification
- Compliance
- Human resources
- Finance
- Operations
- Engineering support

For a large registry, the router should first retrieve a relevant subset of agents instead of sending all 50 complete agent definitions to the model.

A possible routing process is:

```text
User request
→ domain classification
→ retrieve relevant agent definitions
→ select specialized agent
→ execute workflow
```

## 12. Scaling concurrent users

The web and orchestration layers should be stateless and horizontally scalable.

Persistent data should be externalized:

- PostgreSQL for graph checkpoints and transactional records
- Redis for caching, rate limiting, and distributed coordination
- Vector database for document search
- Object storage for source documents
- Message queue for slow or retryable jobs
- ClickHouse for high-volume analytics

Streaming capacity should scale independently from general HTTP traffic.

Possible architecture:

```text
Regular API traffic
→ API workers

Long-lived streaming traffic
→ dedicated streaming workers

Background processing
→ queue workers
```

## 13. Redis usage

Redis can support:

- Request rate limiting
- Session caching
- Agent registry caching
- Retrieval-result caching
- Distributed locks
- Approval expiration
- Short-lived workflow metadata
- Streaming connection coordination

Redis should not replace the transactional database for authoritative enrollment records.

## 14. Queue and worker architecture

Slow or retryable tasks should be placed on a queue.

Examples:

- Large document ingestion
- Re-embedding documents
- Certification report generation
- Email notifications
- Analytics aggregation
- Batch compliance checks

Workflow:

```text
API request
→ enqueue job
→ return job ID
→ worker processes job
→ save result
→ notify user
```

Possible technologies:

- Kafka
- RabbitMQ
- AWS SQS
- Google Pub/Sub
- Redis-backed queues

## 15. Reliability

Production reliability controls should include:

- Idempotency keys
- Tool timeouts
- Limited retries
- Dead-letter queues
- Circuit breakers
- Provider fallback
- Checkpoint recovery
- Cancellation propagation
- Backpressure handling
- Approval expiration
- Duplicate-write protection

Retries should only be used for operations that are safe to retry.

## 16. Security

Production security should include:

- Enterprise SSO
- OAuth or OpenID Connect
- Server-validated identity
- Role-based authorization
- Attribute-based authorization
- Tenant isolation
- Least-privilege tool access
- Human approval for high-impact writes
- Secrets manager
- Prompt-injection protection
- Document-access filtering
- Audit logging
- Rate limiting

Retrieved documents must be filtered using the authenticated user's permissions before their content is sent to the model.

## 17. Prompt-injection protection

Retrieved text should be treated as untrusted data.

The system should:

- Ignore instructions contained inside retrieved documents
- Restrict tools by agent and permission
- Avoid placing secrets in prompts
- Validate structured tool arguments
- Apply access filters before retrieval
- Limit returned document content
- Record sensitive tool usage in audit logs

## 18. Observability

Every workflow should include:

- Request ID
- Thread ID
- Agent-run ID
- Selected agent
- Routing decision
- Router latency
- Prompt version
- Model name
- Tool calls
- Tool duration
- Time to first token
- Total response duration
- Input tokens
- Output tokens
- Approval result
- Final workflow outcome
- Error category

Structured logs should be sent to a centralized logging system.

High-volume product and agent analytics can be stored in ClickHouse.

Distributed traces can be exported using OpenTelemetry.

## 19. Kubernetes and OpenShift deployment

A production deployment can use Kubernetes or OpenShift.

Suggested workloads:

- Next.js web deployment
- Streaming API deployment
- LangGraph orchestration workers
- Retrieval workers
- Background queue workers

Autoscaling signals can include:

- CPU usage
- Memory usage
- Concurrent streams
- Queue depth
- Tool latency
- Model-request concurrency
- Request latency

Secrets should be provided through:

- Kubernetes Secrets
- OpenShift Secrets
- External secrets managers

## 20. Current limitations

The current demo does not include:

- Real SSO
- Persistent vector database
- Distributed Redis cache
- Tenant isolation
- Production rate limiting
- Background queues
- Production Kubernetes configuration
- Real employee records
- Real certification policies

The PostgreSQL path demonstrates durable checkpoints and transactional,
idempotent enrollment writes, but it is still an integration-demo boundary.
Production deployment also needs managed backups, credential rotation,
tenant-aware row security, migration promotion, capacity testing, and disaster
recovery procedures.
