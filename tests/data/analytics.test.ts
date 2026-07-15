import { describe, expect, it } from "vitest";

import { getCertificationStats } from "@/data/mock-analytics-data";

describe("certification analytics", () => {
  it("calculates the Operations completion rate", () => {
    const [operations] =
      getCertificationStats("Operations");

    expect(operations).toMatchObject({
      department: "Operations",
      totalEmployees: 100,
      completed: 61,
      completionRate: 61,
      overdue: 18,
      atRisk: true,
    });
  });

  it("marks Finance as on track", () => {
    const [finance] =
      getCertificationStats("Finance");

    expect(finance).toMatchObject({
      completionRate: 85,
      atRisk: false,
    });
  });

  it("returns no records for an unknown department", () => {
    expect(
      getCertificationStats(
        "Unknown Department",
      ),
    ).toEqual([]);
  });
});