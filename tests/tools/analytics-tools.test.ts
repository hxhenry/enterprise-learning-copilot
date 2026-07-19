import { describe, expect, it } from "vitest";

import type { AgentEventPayload } from "@/lib/schemas/events";
import { createAnalyticsTools } from "@/lib/tools/analytics-tools";
import { executeTool } from "@/tests/tools/tool-test-helper";

describe("analytics tools", () => {
  it("returns statistics and a structured experience block", async () => {
    const events: AgentEventPayload[] = [];
    const tools = createAnalyticsTools((event) => events.push(event));

    const result = await executeTool<
      { department?: string },
      {
        found: boolean;
        statistics: Array<{ department: string }>;
        atRiskDepartments?: string[];
      }
    >(tools.getDepartmentCertificationStats, {});

    expect(result.found).toBe(true);
    expect(result.statistics).toHaveLength(4);
    expect(result.atRiskDepartments).toContain("Operations");
    expect(
      events.find((event) => event.type === "experience"),
    ).toMatchObject({
      block: {
        kind: "analytics-summary",
        highestRiskDepartment: "Operations",
      },
    });
  });

  it("returns an empty result for an unknown department", async () => {
    const tools = createAnalyticsTools(() => undefined);

    const result = await executeTool<
      { department: string },
      { found: boolean; statistics: unknown[] }
    >(tools.getDepartmentCertificationStats, {
      department: "Unknown",
    });

    expect(result).toMatchObject({
      found: false,
      statistics: [],
    });
  });
});
