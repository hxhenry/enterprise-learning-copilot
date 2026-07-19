import { describe, expect, it } from "vitest";

import {
  AGENT_EVENT_PROTOCOL_VERSION,
  isAgentEvent,
  isAgentEventPayload,
  isApprovalRequest,
  isExperienceBlock,
  type AgentEventPayload,
} from "@/lib/schemas/events";

const validApprovalRequest = {
  actionId: "action-123",
  actionType: "course-enrollment",
  title: "Approve course enrollment",
  description:
    "Enroll Henry in Secure Cloud Networking.",
  userId: "user-001",
  courseId: "course-network-301",
  courseTitle:
    "Secure Cloud Networking",
  risk:
    "This action changes application data.",
} as const;

const validEventMetadata = {
  protocolVersion: AGENT_EVENT_PROTOCOL_VERSION,
  sequence: 1,
  emittedAt: "2026-07-15T20:00:00.000Z",
  requestId: "request-123",
  agentRunId: "run-123",
  threadId: "thread-123",
} as const;

const validCourseItem = {
  id: "course-101",
  title: "Cloud Fundamentals",
  level: "beginner" as const,
  durationHours: 4,
};

const validPayloads: AgentEventPayload[] = [
  { type: "status", message: "Routing..." },
  {
    type: "agent-selected",
    agentId: "tutor",
    agentName: "Course Tutor Agent",
    reason: "A course question was detected.",
  },
  {
    type: "tool-start",
    toolName: "searchCourseKnowledge",
    message: "Searching...",
  },
  {
    type: "tool-result",
    toolName: "searchCourseKnowledge",
    summary: "One source found.",
  },
  {
    type: "experience",
    block: {
      id: "progress-1",
      kind: "certification-progress",
      certificationId: "cert-cloud-security",
      certificationName: "Cloud Security Certification",
      passingScore: 80,
      completionPercent: 50,
      completedCourses: [validCourseItem],
      remainingCourses: [
        {
          ...validCourseItem,
          id: "course-201",
          level: "advanced",
        },
      ],
    },
  },
  {
    type: "experience",
    block: {
      id: "analytics-1",
      kind: "analytics-summary",
      title: "Certification status",
      statistics: [
        {
          department: "Engineering",
          totalEmployees: 10,
          completed: 5,
          inProgress: 3,
          overdue: 2,
          completionRate: 50,
          atRisk: true,
        },
      ],
      highestRiskDepartment: "Engineering",
    },
  },
  {
    type: "experience",
    block: {
      id: "sources-1",
      kind: "sources",
      sources: [
        {
          citationId: "S1",
          title: "Identity and Access Management",
          source: "identity-access-management.md",
          category: "course",
          excerpt: "Use least privilege.",
        },
      ],
    },
  },
  { type: "token", content: "Hello" },
  { type: "done" },
  { type: "approval-required", request: validApprovalRequest },
  {
    type: "approval-resolved",
    actionId: "action-123",
    approved: true,
    message: "Enrollment approved.",
  },
  {
    type: "error",
    code: "WORKFLOW_EXECUTION_FAILED",
    message: "The workflow failed.",
    retryable: false,
  },
];

describe("agent event validation", () => {
  it("accepts a valid approval request", () => {
    expect(
      isApprovalRequest(
        validApprovalRequest,
      ),
    ).toBe(true);
  });

  it("accepts an approval-required event", () => {
    expect(
      isAgentEventPayload({
        type: "approval-required",
        request: validApprovalRequest,
      }),
    ).toBe(true);
  });

  it("rejects an approval event without an action ID", () => {
    expect(
      isAgentEventPayload({
        type: "approval-required",
        request: {
          ...validApprovalRequest,
          actionId: 123,
        },
      }),
    ).toBe(false);
  });

  it("accepts a valid experience block", () => {
    expect(
      isAgentEventPayload({
        type: "experience",
        block: {
          id: "progress-1",
          kind: "certification-progress",
          certificationId:
            "cert-cloud-security",
          certificationName:
            "Cloud Security Certification",
          passingScore: 80,
          completionPercent: 50,
          completedCourses: [],
          remainingCourses: [],
        },
      }),
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      isAgentEventPayload({
        type: "execute-arbitrary-code",
      }),
    ).toBe(false);
  });

  it.each(validPayloads)("accepts the $type payload contract", (payload) => {
    expect(isAgentEventPayload(payload)).toBe(true);
  });

  it.each([
    null,
    { id: "unknown", kind: "unknown" },
    {
      id: "progress-1",
      kind: "certification-progress",
      certificationId: "cert-1",
      certificationName: "Certification",
      passingScore: 80,
      completionPercent: 50,
      completedCourses: [{ ...validCourseItem, level: "expert" }],
      remainingCourses: [],
    },
    {
      id: "analytics-1",
      kind: "analytics-summary",
      title: "Summary",
      statistics: [{ department: "Engineering" }],
      highestRiskDepartment: null,
    },
    {
      id: "sources-1",
      kind: "sources",
      sources: [{ citationId: "S1" }],
    },
  ])("rejects an invalid experience block: %o", (block) => {
    expect(isExperienceBlock(block)).toBe(false);
  });

  it("accepts a versioned event envelope", () => {
    expect(
      isAgentEvent({
        ...validEventMetadata,
        payload: {
          type: "status",
          message: "Routing the request...",
        },
      }),
    ).toBe(true);
  });

  it.each([
    { sequence: 0 },
    { sequence: 1.5 },
    { emittedAt: "July 15, 2026" },
    { emittedAt: 123 },
    { protocolVersion: "2.0" },
    { requestId: "" },
    { agentRunId: "" },
    { threadId: "" },
  ])("rejects invalid event metadata: %o", (override) => {
    expect(
      isAgentEvent({
        ...validEventMetadata,
        ...override,
        payload: {
          type: "done",
        },
      }),
    ).toBe(false);
  });

  it("requires a known typed error contract", () => {
    expect(
      isAgentEventPayload({
        type: "error",
        code: "WORKFLOW_EXECUTION_FAILED",
        message: "The workflow failed.",
        retryable: false,
      }),
    ).toBe(true);

    expect(
      isAgentEventPayload({
        type: "error",
        code: "INTERNAL_STACK_TRACE",
        message: "The workflow failed.",
        retryable: false,
      }),
    ).toBe(false);
  });
});
