# Enterprise Learning Copilot Demo Guide

## Demo objective

Show one coherent agentic application—not four disconnected AI features. The
audience should leave understanding how model reasoning, deterministic tools,
streaming UI, and human control fit together.

Suggested opening:

> Enterprise Learning Copilot is a TypeScript and Next.js integration demo. A
> LangGraph workflow routes each request to a specialist agent, validated tools
> provide trusted data, and typed SSE events drive reusable React experiences.
> All data is fictional and process-local so the architecture is visible
> without production infrastructure.

## Preflight

Before the presentation:

1. Add a valid `OPENAI_API_KEY` to `.env.local`.
2. Run the quality gate:

   ```bash
   npm run check
   ```

3. Start a clean process:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).
5. Confirm the page shows **Interview demo** and the **Local demo · process
   memory** status.
6. Keep the terminal visible in another window so structured logs can be shown
   if asked.

A server restart gives the cleanest starting point because it clears mutable
enrollment records, graph checkpoints, and the in-memory retrieval index. The
index is rebuilt on the first RAG request, so that first request may be slower.

## Guided walkthrough

The right-side panel contains four ordered scenarios. Selecting a scenario
places its prompt in the composer; review it, then send it. Wait for the current
response or approval to finish before starting the next scenario.

### 1. Grounded RAG

Prompt:

> Using our internal course documents, explain the principle of least privilege
> and cite the sources you use.

Expected behavior:

- The router selects **Course Tutor Agent**.
- The activity timeline shows `searchCourseKnowledge`.
- The answer streams incrementally.
- A source card shows an excerpt from the local Identity and Access Management
  document.
- The answer cites retrieved IDs such as `[S1]`.

What to say:

> The model chooses an allowed retrieval tool, but the server owns that tool and
> its Zod-validated input. LangChain chunks and embeds the local Markdown,
> low-relevance matches are rejected, and the UI renders only passages cited by
> the completed answer as typed data—not model-generated JSX.

Optional grounding-boundary check:

> What is React `useRef`? Find related references.

The internal corpus contains no React material. The expected result is no
source card and a transparent statement that any general explanation comes
from model knowledge rather than the internal documents. This demonstrates
that “nearest passage” is not automatically treated as “supporting evidence.”

### 2. Certification progress and tool calling

Prompt:

> How am I progressing toward the Cloud Security Certification, and which
> course should I take next?

Expected behavior:

- The router selects **Certification Agent**.
- The agent calls the certification-progress tool backed by fictional learning
  records.
- The progress card shows **50% complete**: two of four required courses.
- **Secure Cloud Networking** is the next incomplete required course.

What to say:

> The LLM explains the result, but deterministic application code supplies the
> user, requirements, completed courses, and percentage. The repository
> interface keeps the agent independent of today's in-memory adapter.

### 3. Business analytics

Prompt:

> Which department is most at risk for certification completion, and what
> numbers support that conclusion?

Expected behavior:

- The router selects **Business Analytics Agent**.
- The analytics tool returns calculated department metrics.
- The analytics component compares all departments.
- **Operations** is the highest-risk department with 61% completion and 18
  overdue employees in the seeded dataset.

What to say:

> The agent is not asked to invent or calculate business records from prose.
> A read-only tool returns deterministic metrics, while the model turns those
> metrics into a concise business explanation.

### 4. Human approval

Prompt:

> Enroll me in Secure Cloud Networking.

Expected behavior:

- The router recognizes a write request.
- The server resolves the course and creates an action ID.
- LangGraph interrupts before the write.
- The UI renders a trusted approval card and blocks another chat request.
- **Approve** resumes the graph and creates one in-memory enrollment; **Reject**
  resumes it without changing records.
- The activity timeline reports the approval outcome.

What to say before deciding:

> Enrollment is deliberately not exposed as an LLM-callable write tool. The
> server creates and validates the pending action, and LangGraph checkpoints the
> interrupt. Only this explicit UI decision can resume the write path.

Choose **Approve** for the clearest happy path. If the same completed action is
submitted again, checkpoint and adapter checks prevent a second enrollment
inside the current process.

For a fail-closed check, request an unavailable title such as **OOP Design
System**. The server should report that it is not in the course catalog and must
not reuse a course mentioned earlier in the conversation.

## Five-minute talk track

If time is limited, use this structure:

| Time | Focus |
| --- | --- |
| 0:00–0:30 | State the problem, technology choices, and fictional-data scope |
| 0:30–1:30 | Run grounded RAG; point to routing, tool activity, tokens, and sources |
| 1:30–2:30 | Run certification progress; contrast LLM explanation with deterministic data |
| 2:30–3:20 | Run analytics; show a reusable API-driven business component |
| 3:20–4:30 | Run enrollment; explain interrupt/resume before approving |
| 4:30–5:00 | State limitations and the production roadmap |

Model latency can make a five-minute live run tight. For a safer interview,
tell the interviewer the complete walkthrough is approximately eight minutes,
or demonstrate RAG plus approval live and explain the middle two from the
guided panel.

Suggested close:

> This branch proves the end-to-end AI integration boundary: model-assisted
> routing, tools, RAG, stateful approval, typed streaming, and reusable React
> experiences. It intentionally stops before production infrastructure. The
> repository, checkpoint, identity, logging, and retrieval boundaries show
> where durable enterprise adapters would be introduced.

## What to point out in the UI

Do not focus only on the final response. Point to:

- The capability labels and explicit safe-demo scope
- The guided scenario panel
- Agent selection and its routing reason
- Tool start/result activity
- Incrementally streamed text
- Typed certification, analytics, and source components
- The approval card and the disabled composer during a pending action
- The process-local status badge
- The **New conversation** control

The new-conversation control resets browser messages and creates a new thread.
It does not delete server-side in-memory enrollment records. Restart the server
when a completely clean mutable dataset is required.

## Likely interview questions

### What makes this agentic rather than a normal chatbot?

The model makes bounded routing and read-tool decisions inside a stateful
LangGraph workflow. Different specialist nodes have different prompts and tool
sets, and enrollment can pause and resume across an explicit human decision.

### Why LangGraph?

The application needs explicit state, conditional branches, checkpoints, and a
human interrupt/resume lifecycle. These concerns are easier to inspect and test
as a graph than as one large route handler.

### Why SSE instead of WebSockets?

Responses primarily flow from server to browser. Streaming `fetch()` plus SSE
keeps user messages and approval decisions as regular POSTs while supporting
incremental status, tools, components, and tokens.

### Can the model render arbitrary React?

No. It can cause the server to emit allow-listed, runtime-validated experience
data. React maps each known block kind to a trusted component.

### How is hallucination reduced?

Authoritative progress and analytics come from deterministic tools, and
internal knowledge questions use score-gated passages. Low-relevance matches
are discarded, and the source card shows only retrieved citation IDs that the
answer actually used. An out-of-scope search is labelled as general model
knowledge instead of being attributed to local documents. This still does not
prove that every cited sentence is entailed by its passage, so claim-level
verification remains a production improvement.

### What is actually persistent?

Only the Markdown source files persist on disk. Checkpoints, vector index, mock
business state, and enrollment writes are process-local and disappear when the
server restarts.

### How are duplicate approvals handled?

The completed action ID is recorded in graph checkpoint state, the enrollment
adapter checks duplicate actions and user/course pairs, and concurrent approval
resumes for the same thread/action are serialized within one process. This is
demo-level idempotency, not a distributed exactly-once guarantee.

### What would change for production?

Introduce verified enterprise identity; durable checkpoints and transactional
records; tenant-aware retrieval; centralized telemetry; and, only where needed,
distributed caching, queues, and deployment automation. PostgreSQL, Redis,
MongoDB, ClickHouse, Kubernetes, and OpenShift are roadmap options, not current
integrations.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Configuration error before streaming | Confirm `OPENAI_API_KEY` is present in `.env.local`, then restart |
| First RAG response is slow | The in-memory embedding index is built lazily on first search |
| Approval card remains pending | Wait for the current request; do not start a second scenario until it resolves |
| Course already enrolled | Restart the development server for a clean in-memory dataset |
| Stream stopped | Start a new conversation and resend the scenario after confirming connectivity |
| Answer wording differs | Expected: model prose varies; routing, tool data, event types, and trusted component shapes are constrained |

## Truthful scope statement

Use this exact framing if the interviewer asks whether the demo is production
ready:

> It is a presentation-ready, pre-production integration demo, not a production
> deployment. The AI, workflow, API, streaming, validation, approval, testing,
> and React integration are implemented. Business data, checkpoints, retrieval
> indexes, concurrency guards, and logs remain local to one application process.
