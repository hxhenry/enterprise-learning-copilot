import { describe, expect, it } from "vitest";

import type { AgentEventPayload } from "@/lib/schemas/events";
import { createCertificationTools } from "@/lib/tools/certification-tools";
import { executeTool } from "@/tests/tools/tool-test-helper";

describe("certification tools", () => {
  it("reads the complete certification workflow through repository contracts", async () => {
    const events: AgentEventPayload[] = [];
    const tools = createCertificationTools((event) => events.push(event));

    const profile = await executeTool<
      { userId: string },
      { found: boolean; user?: { name: string } }
    >(tools.getUserProfile, { userId: "user-001" });
    const completed = await executeTool<
      { userId: string },
      { found: boolean; courses: Array<{ id: string }> }
    >(tools.getCompletedCourses, { userId: "user-001" });
    const progress = await executeTool<
      { userId: string; certificationQuery: string },
      {
        found: boolean;
        completionPercent?: number;
        remainingCourses?: Array<{ id: string }>;
      }
    >(tools.getCertificationProgress, {
      userId: "user-001",
      certificationQuery: "Cloud Security Certification",
    });
    const requirements = await executeTool<
      { certificationQuery: string },
      { found: boolean; requiredCourses?: Array<{ id: string }> }
    >(tools.getCertificationRequirements, {
      certificationQuery: "cert-cloud-security",
    });
    const courses = await executeTool<
      { certificationId: string },
      { found: boolean; courses: Array<{ id: string }> }
    >(tools.getCertificationCourses, {
      certificationId: "cert-cloud-security",
    });

    expect(profile).toMatchObject({
      found: true,
      user: { name: "Henry" },
    });
    expect(completed.courses).toHaveLength(2);
    expect(progress).toMatchObject({
      found: true,
      completionPercent: 50,
    });
    expect(progress.remainingCourses).toHaveLength(2);
    expect(requirements.requiredCourses).toHaveLength(4);
    expect(courses.courses).toHaveLength(4);
    expect(
      events.find((event) => event.type === "experience"),
    ).toMatchObject({
      block: {
        kind: "certification-progress",
        completionPercent: 50,
      },
    });
  });

  it("returns user-safe not-found results", async () => {
    const tools = createCertificationTools(() => undefined);

    const profile = await executeTool<
      { userId: string },
      { found: boolean }
    >(tools.getUserProfile, { userId: "unknown-user" });
    const progress = await executeTool<
      { userId: string; certificationQuery: string },
      { found: boolean }
    >(tools.getCertificationProgress, {
      userId: "user-001",
      certificationQuery: "Unknown certification",
    });
    const courses = await executeTool<
      { certificationId: string },
      { found: boolean; courses: unknown[] }
    >(tools.getCertificationCourses, {
      certificationId: "unknown-certification",
    });

    expect(profile.found).toBe(false);
    expect(progress.found).toBe(false);
    expect(courses).toMatchObject({
      found: false,
      courses: [],
    });
  });
});
