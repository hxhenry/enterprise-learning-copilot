import { describe, expect, it } from "vitest";

import {
  isAgentEvent,
  isApprovalRequest,
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
      isAgentEvent({
        type: "approval-required",
        request: validApprovalRequest,
      }),
    ).toBe(true);
  });

  it("rejects an approval event without an action ID", () => {
    expect(
      isAgentEvent({
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
      isAgentEvent({
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
      isAgentEvent({
        type: "execute-arbitrary-code",
      }),
    ).toBe(false);
  });
});