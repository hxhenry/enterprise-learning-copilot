import { describe, expect, it } from "vitest";

import {
  hasContextualCourseReference,
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

  it.each([
    "Enroll me in that course.",
    "Enroll me in that one.",
    "Register me for the one you recommended.",
    "Please enroll me in it.",
    "Help me enroll in that course.",
  ])("recognizes a contextual course reference: %s", (message) => {
    expect(hasContextualCourseReference(message)).toBe(true);
  });

  it.each([
    "Enroll me in OOP Design System.",
    "Enroll me in a course that teaches OOP.",
    "Enroll me in IT Security.",
    "Enroll me in this OOP course.",
    "Enroll me in OOP Design System, not that course.",
    "Enroll me in one of those courses.",
    "Enroll me.",
  ])("does not treat an explicit title as contextual: %s", (message) => {
    expect(hasContextualCourseReference(message)).toBe(false);
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

  it("does not replace an unknown explicit title with an older course", async () => {
    const conversation: ConversationTurn[] = [
      {
        role: "assistant",
        content: "You completed Cloud Security Fundamentals.",
      },
      {
        role: "user",
        content: "Help me to enroll OOP desgin system.",
      },
    ];

    const result = await resolveRequestedCourse({
      userMessage: "Help me to enroll OOP desgin system.",
      conversation,
      userId: "user-001",
    });

    expect(result).toBeUndefined();
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
