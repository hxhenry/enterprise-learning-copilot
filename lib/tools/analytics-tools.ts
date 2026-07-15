import { tool } from "ai";
import { z } from "zod";

import { getCertificationStats } from "@/data/mock-analytics-data";
import type { AgentEvent } from "@/lib/schemas/events";

type AgentEventReporter = (event: AgentEvent) => void;

export function createAnalyticsTools(reportEvent: AgentEventReporter) {
  return {
    getDepartmentCertificationStats: tool({
      description:
        "Retrieve certification completion, in-progress, overdue, completion-rate, and risk statistics for one department or all departments.",

      inputSchema: z.object({
        department: z
          .string()
          .optional()
          .describe(
            "Optional department name. Omit it to retrieve statistics for all departments.",
          ),
      }),

      execute: async ({ department }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getDepartmentCertificationStats",
          message: department
            ? `Loading certification analytics for ${department}...`
            : "Loading certification analytics for all departments...",
        });

        const statistics = getCertificationStats(department);

        if (statistics.length === 0) {
          reportEvent({
            type: "tool-result",
            toolName: "getDepartmentCertificationStats",
            summary: "No matching department analytics were found.",
          });

          return {
            found: false,
            department,
            statistics: [],
            message:
              "No certification statistics were found for that department.",
          };
        }

        const atRiskDepartments = statistics.filter(
          (statistic) => statistic.atRisk,
        );

        const highestRiskDepartment =
          [...statistics].sort((left, right) => {
            if (left.completionRate !== right.completionRate) {
              return left.completionRate - right.completionRate;
            }

            return right.overdue - left.overdue;
          })[0]?.department ?? null;

        reportEvent({
          type: "tool-result",
          toolName: "getDepartmentCertificationStats",
          summary: `${statistics.length} department record${
            statistics.length === 1 ? "" : "s"
          } loaded. ${atRiskDepartments.length} marked at risk.`,
        });

        reportEvent({
          type: "experience",
          block: {
            id: `analytics-summary-${
              department?.trim().toLowerCase() || "all"
            }`,
            kind: "analytics-summary",
            title: department
              ? `${department} Certification Analytics`
              : "Department Certification Analytics",
            statistics,
            highestRiskDepartment,
          },
        });

        return {
          found: true,
          statistics,
          atRiskDepartments: atRiskDepartments.map(
            (statistic) => statistic.department,
          ),
        };
      },
    }),
  };
}

export type AnalyticsTools = ReturnType<typeof createAnalyticsTools>;
