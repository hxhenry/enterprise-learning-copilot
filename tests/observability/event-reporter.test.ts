import { afterEach, describe, expect, it, vi } from "vitest";

import { createObservedEventReporter } from "@/lib/observability/event-reporter";
import type { RunContext } from "@/lib/observability/run-context";
import {
  AGENT_EVENT_PROTOCOL_VERSION,
  type AgentEvent,
} from "@/lib/schemas/events";

const context: RunContext = {
  requestId: "request-123",
  agentRunId: "run-123",
  threadId: "thread-123",
  operation: "chat",
};

describe("observed event reporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enriches payloads with stable metadata and sequence numbers", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const events: AgentEvent[] = [];
    const reportEvent = createObservedEventReporter({
      context,
      emit: (event) => events.push(event),
      now: () => new Date("2026-07-15T20:00:00.000Z"),
    });

    reportEvent({
      type: "status",
      message: "Routing...",
    });
    reportEvent({
      type: "done",
    });

    expect(events).toEqual([
      {
        protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
        sequence: 1,
        emittedAt: "2026-07-15T20:00:00.000Z",
        requestId: "request-123",
        agentRunId: "run-123",
        threadId: "thread-123",
        payload: {
          type: "status",
          message: "Routing...",
        },
      },
      {
        protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
        sequence: 2,
        emittedAt: "2026-07-15T20:00:00.000Z",
        requestId: "request-123",
        agentRunId: "run-123",
        threadId: "thread-123",
        payload: {
          type: "done",
        },
      },
    ]);
  });

  it("observes agent, tool, experience, approval, and error events", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const events: AgentEvent[] = [];
    const reportEvent = createObservedEventReporter({
      context,
      emit: (event) => events.push(event),
    });

    reportEvent({
      type: "agent-selected",
      agentId: "tutor",
      agentName: "Course Tutor Agent",
      reason: "A course question was detected.",
    });
    reportEvent({
      type: "tool-start",
      toolName: "searchCourseKnowledge",
      message: "Searching...",
    });
    reportEvent({
      type: "tool-result",
      toolName: "searchCourseKnowledge",
      summary: "One source found.",
    });
    reportEvent({
      type: "experience",
      block: {
        id: "sources-1",
        kind: "sources",
        sources: [],
      },
    });
    reportEvent({
      type: "approval-required",
      request: {
        actionId: "action-123",
        actionType: "course-enrollment",
        title: "Approve course enrollment",
        description: "Enroll Henry in Secure Cloud Networking.",
        userId: "user-001",
        courseId: "course-network-301",
        courseTitle: "Secure Cloud Networking",
        risk: "This action changes application data.",
      },
    });
    reportEvent({
      type: "approval-resolved",
      actionId: "action-123",
      approved: true,
      message: "Enrollment approved.",
    });
    reportEvent({
      type: "error",
      code: "WORKFLOW_EXECUTION_FAILED",
      message: "The workflow failed.",
      retryable: false,
    });

    expect(events.map((event) => event.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
