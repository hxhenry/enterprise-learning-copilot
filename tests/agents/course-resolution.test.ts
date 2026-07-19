import { describe, expect, it } from "vitest";

import {
  isNextCourseRequest,
  resolveRequestedCourse,
} from "@/lib/agents/course-resolution";
import type { ConversationTurn } from "@/lib/agents/state";

describe("course resolution", () => {
  it.each([
    "Enroll me in my next course.",
    "Enroll me in my next required course.",
    "Enroll me in my next recommended course.",
  ])(
    "recognizes next-course request: %s",
    (message) => {
      expect(
        isNextCourseRequest(message),
      ).toBe(true);
    },
  );

  it("does not treat an explicit course as a next-course request", () => {
    expect(
      isNextCourseRequest(
        "Enroll me in Cloud Incident Response.",
      ),
    ).toBe(false);
  });

  it("returns the next incomplete required course", async () => {
    const result = await resolveRequestedCourse({
      userMessage:
        "Enroll me in my next required course.",
      conversation: [],
      userId: "user-001",
    });

    expect(result).toMatchObject({
      id: "course-network-301",
      title: "Secure Cloud Networking",
    });
  });

  it("returns a directly named course", async () => {
    const result = await resolveRequestedCourse({
      userMessage:
        "Enroll me in Cloud Incident Response.",
      conversation: [],
      userId: "user-001",
    });

    expect(result).toMatchObject({
      id: "course-incident-401",
      title: "Cloud Incident Response",
    });
  });

  it("can resolve a course from recent context", async () => {
    const conversation: ConversationTurn[] = [
      {
        role: "assistant",
        content:
          "Your next topic is Secure Cloud Networking.",
      },
      {
        role: "user",
        content: "Enroll me in that one.",
      },
    ];

    const result = await resolveRequestedCourse({
      userMessage: "Enroll me in that one.",
      conversation,
      userId: "user-001",
    });

    expect(result).toMatchObject({
      id: "course-network-301",
    });
  });

  it("returns undefined when no course can be identified", async () => {
    const result = await resolveRequestedCourse({
      userMessage:
        "Please enroll me in something interesting.",
      conversation: [],
      userId: "user-001",
    });

    expect(result).toBeUndefined();
  });
});
