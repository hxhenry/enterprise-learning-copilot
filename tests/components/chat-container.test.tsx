import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { ChatContainer } from "@/components/chat/chat-container";
import { PRESENTATION_SCENARIOS } from "@/lib/demo/presentation-scenarios";
import {
  AGENT_EVENT_PROTOCOL_VERSION,
  type AgentEvent,
  type AgentEventPayload,
} from "@/lib/schemas/events";
import { encodeAgentEvent } from "@/lib/streaming/agent-event-stream";

type ChatRequestBody = {
  message: string;
  threadId: string;
};

const approvalRequest = {
  actionId: "action-presentation-enrollment",
  actionType: "course-enrollment" as const,
  title: "Approve course enrollment",
  description: "Enroll Henry in Secure Cloud Networking.",
  userId: "user-001",
  courseId: "course-network-301",
  courseTitle: "Secure Cloud Networking",
  risk: "This action creates an enrollment record and changes application data.",
};

function createEventResponse(
  threadId: string,
  payloads: AgentEventPayload[],
  requestId = `request-${threadId}`,
): Response {
  const events: AgentEvent[] = payloads.map((payload, index) => ({
    protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
    sequence: index + 1,
    emittedAt: "2026-07-16T05:00:00.000Z",
    requestId,
    agentRunId: `run-${threadId}`,
    threadId,
    payload,
  }));
  const decoder = new TextDecoder();
  const body = events
    .map((event) => decoder.decode(encodeAgentEvent(event)))
    .join("");

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Request-Id": requestId,
    },
  });
}

function parseChatRequest(init?: RequestInit): ChatRequestBody {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON chat request body.");
  }

  return JSON.parse(init.body) as ChatRequestBody;
}

function readyHealthResponse(): Response {
  return Response.json({
    status: "ready",
    persistence: "memory",
  });
}

describe("ChatContainer presentation flow", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads a guided prompt and renders its streamed workflow evidence", async () => {
    const scenario = PRESENTATION_SCENARIOS[0];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/health") {
          return readyHealthResponse();
        }

        if (String(input) !== "/api/chat") {
          throw new Error(`Unexpected request: ${String(input)}`);
        }

        const request = parseChatRequest(init);

        return createEventResponse(request.threadId, [
          {
            type: "agent-selected",
            agentId: "tutor",
            agentName: "Course Tutor Agent",
            reason: "The request needs grounded course material.",
          },
          {
            type: "tool-start",
            toolName: "searchCourseKnowledge",
            message: "Searching trusted course material...",
          },
          {
            type: "tool-result",
            toolName: "searchCourseKnowledge",
            summary: "Found trusted IAM guidance.",
          },
          {
            type: "experience",
            block: {
              id: "sources-least-privilege",
              kind: "sources",
              sources: [
                {
                  citationId: "S1",
                  title: "Identity and Access Management",
                  source: "identity-access-management.md",
                  category: "course",
                  excerpt: "Least privilege limits access to what is required.",
                },
              ],
            },
          },
          {
            type: "token",
            content: "Least privilege grants only required access [S1].",
          },
          { type: "done" },
        ]);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatContainer />);

    const composer = screen.getByRole("textbox", {
      name: "Ask the learning copilot a question",
    });

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(scenario.title, "i") }),
    );

    expect(composer).toHaveValue(scenario.prompt);
    expect(composer).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(
        "Least privilege grants only required access [S1].",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Workflow trace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Route")).toBeInTheDocument();
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Grounding evidence" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Identity and Access Management"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Copilot response complete. Least privilege grants only required access [S1].",
      ),
    ).toBeInTheDocument();

    const chatCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "/api/chat",
    );
    const request = parseChatRequest(chatCall?.[1]);

    expect(request).toEqual({
      message: scenario.prompt,
      threadId: expect.any(String),
    });
  });

  it("resolves a pending approval before starting a new thread", async () => {
    const enrollmentScenario = PRESENTATION_SCENARIOS[3];
    const tutorScenario = PRESENTATION_SCENARIOS[0];
    const chatRequests: ChatRequestBody[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/health") {
          return readyHealthResponse();
        }

        if (String(input) === "/api/chat/approval") {
          return createEventResponse(
            chatRequests[0]?.threadId ?? "missing-thread",
            [
              {
                type: "approval-resolved",
                actionId: approvalRequest.actionId,
                approved: false,
                message: "Enrollment was rejected.",
              },
              { type: "done" },
            ],
            "request-approval",
          );
        }

        if (String(input) !== "/api/chat") {
          throw new Error(`Unexpected request: ${String(input)}`);
        }

        const request = parseChatRequest(init);
        chatRequests.push(request);

        return createEventResponse(
          request.threadId,
          request.message === enrollmentScenario.prompt
            ? [
                {
                  type: "approval-required",
                  request: approvalRequest,
                },
                { type: "done" },
              ]
            : [
                {
                  type: "token",
                  content: "A fresh conversation answer.",
                },
                { type: "done" },
              ],
          `request-${chatRequests.length}`,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ChatContainer />);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(enrollmentScenario.title, "i"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByRole("region", {
        name: "Approve course enrollment",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "Ask the learning copilot a question",
      }),
    ).toBeDisabled();

    const newConversationButton = screen.getByRole("button", {
      name: "New conversation",
    });

    expect(newConversationButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(newConversationButton).toBeEnabled());
    fireEvent.click(newConversationButton);

    const composer = screen.getByRole("textbox", {
      name: "Ask the learning copilot a question",
    });

    expect(
      screen.queryByRole("region", { name: "Approve course enrollment" }),
    ).not.toBeInTheDocument();
    expect(composer).toBeEnabled();
    expect(composer).toHaveValue("");
    expect(composer).toHaveFocus();
    expect(
      screen.getByText(/Welcome to Enterprise Learning Copilot/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(tutorScenario.title, "i"),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("A fresh conversation answer."),
    ).toBeInTheDocument();

    await waitFor(() => expect(chatRequests).toHaveLength(2));
    expect(chatRequests[0]?.threadId).not.toBe(chatRequests[1]?.threadId);
    expect(chatRequests.map((request) => request.message)).toEqual([
      enrollmentScenario.prompt,
      tutorScenario.prompt,
    ]);
  });
});
