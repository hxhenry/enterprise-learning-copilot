import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createCourseEnrollment,
  getUserEnrollments,
} from "@/data/mock-enrollment-data";

describe("course enrollment", () => {
  it("creates one record and prevents duplicate retries", () => {
    const uniqueUserId =
      `test-user-${randomUUID()}`;

    const actionId = randomUUID();

    const firstResult =
      createCourseEnrollment({
        actionId,
        userId: uniqueUserId,
        courseId: "course-network-301",
        courseTitle:
          "Secure Cloud Networking",
        approvedBy: uniqueUserId,
      });

    const retriedResult =
      createCourseEnrollment({
        actionId,
        userId: uniqueUserId,
        courseId: "course-network-301",
        courseTitle:
          "Secure Cloud Networking",
        approvedBy: uniqueUserId,
      });

    const duplicateCourseResult =
      createCourseEnrollment({
        actionId: randomUUID(),
        userId: uniqueUserId,
        courseId: "course-network-301",
        courseTitle:
          "Secure Cloud Networking",
        approvedBy: uniqueUserId,
      });

    expect(firstResult.created).toBe(true);
    expect(retriedResult.created).toBe(false);
    expect(
      duplicateCourseResult.created,
    ).toBe(false);

    expect(
      getUserEnrollments(uniqueUserId),
    ).toHaveLength(1);
  });
});