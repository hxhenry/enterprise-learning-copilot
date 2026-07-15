import { tool } from "ai";
import { z } from "zod";

import {
  completedCourseIdsByUser,
  findCertification,
  findCertificationById,
  findUserById,
  getCoursesByIds,
} from "@/data/mock-learning-data";
import type { AgentEvent } from "@/lib/schemas/events";

type AgentEventReporter = (event: AgentEvent) => void;

export function createCertificationTools(reportEvent: AgentEventReporter) {
  return {
    getUserProfile: tool({
      description:
        "Get the current employee's role, department, and profile information. Use this before creating a personalized learning plan.",

      inputSchema: z.object({
        userId: z
          .string()
          .describe("The employee ID. The demo user ID is user-001."),
      }),

      execute: async ({ userId }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getUserProfile",
          message: "Checking the employee profile...",
        });

        const user = findUserById(userId);

        if (!user) {
          const result = {
            found: false,
            message: `No user was found with ID ${userId}.`,
          };

          reportEvent({
            type: "tool-result",
            toolName: "getUserProfile",
            summary: "Employee profile was not found.",
          });

          return result;
        }

        const result = {
          found: true,
          user,
        };

        reportEvent({
          type: "tool-result",
          toolName: "getUserProfile",
          summary: `Profile loaded for ${user.name}, ${user.role}.`,
        });

        return result;
      },
    }),

    getCompletedCourses: tool({
      description:
        "Get the courses already completed by an employee. Use this when determining which certification courses are still missing.",

      inputSchema: z.object({
        userId: z
          .string()
          .describe("The employee ID. The demo user ID is user-001."),
      }),

      execute: async ({ userId }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getCompletedCourses",
          message: "Checking completed courses...",
        });

        const user = findUserById(userId);

        if (!user) {
          reportEvent({
            type: "tool-result",
            toolName: "getCompletedCourses",
            summary: "Completed courses could not be retrieved.",
          });

          return {
            found: false,
            message: `No user was found with ID ${userId}.`,
            courses: [],
          };
        }

        const completedCourseIds = completedCourseIdsByUser[userId] ?? [];

        const completedCourses = getCoursesByIds(completedCourseIds);

        reportEvent({
          type: "tool-result",
          toolName: "getCompletedCourses",
          summary: `${completedCourses.length} completed courses found.`,
        });

        return {
          found: true,
          userId,
          courses: completedCourses,
        };
      },
    }),
    getCertificationProgress: tool({
      description:
        "Get the current employee's complete progress for a certification, including completed required courses, remaining courses, passing score, and completion percentage. Use this for progress checks and personalized certification plans.",

      inputSchema: z.object({
        userId: z
          .string()
          .describe("The employee ID. The demo user ID is user-001."),

        certificationQuery: z
          .string()
          .describe(
            "The certification ID or name, such as Cloud Security Certification.",
          ),
      }),

      execute: async ({ userId, certificationQuery }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getCertificationProgress",
          message: "Calculating certification progress...",
        });

        const user = findUserById(userId);

        if (!user) {
          reportEvent({
            type: "tool-result",
            toolName: "getCertificationProgress",
            summary: "Certification progress could not be calculated.",
          });

          return {
            found: false,
            message: `No user was found with ID ${userId}.`,
          };
        }

        const certification = findCertification(certificationQuery);

        if (!certification) {
          reportEvent({
            type: "tool-result",
            toolName: "getCertificationProgress",
            summary: "No matching certification was found.",
          });

          return {
            found: false,
            message: `No certification matched "${certificationQuery}".`,
          };
        }

        const requiredCourses = getCoursesByIds(
          certification.requiredCourseIds,
        );

        const completedCourseIds = new Set(
          completedCourseIdsByUser[userId] ?? [],
        );

        const completedCourses = requiredCourses.filter((course) =>
          completedCourseIds.has(course.id),
        );

        const remainingCourses = requiredCourses.filter(
          (course) => !completedCourseIds.has(course.id),
        );

        const completionPercent =
          requiredCourses.length === 0
            ? 0
            : Math.round(
                (completedCourses.length / requiredCourses.length) * 100,
              );

        reportEvent({
          type: "tool-result",
          toolName: "getCertificationProgress",
          summary: `${completedCourses.length} of ${requiredCourses.length} required courses completed.`,
        });

        reportEvent({
          type: "experience",
          block: {
            id: `certification-progress-${userId}-${certification.id}`,
            kind: "certification-progress",
            certificationId: certification.id,
            certificationName: certification.name,
            passingScore: certification.passingScore,
            completionPercent,
            completedCourses,
            remainingCourses,
          },
        });

        return {
          found: true,
          user,
          certification,
          completionPercent,
          completedCourses,
          remainingCourses,
        };
      },
    }),

    getCertificationRequirements: tool({
      description:
        "Find a certification and return its required courses, passing score, and description. Use this before recommending a certification plan.",

      inputSchema: z.object({
        certificationQuery: z
          .string()
          .describe(
            "The certification ID or name, such as Cloud Security Certification.",
          ),
      }),

      execute: async ({ certificationQuery }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getCertificationRequirements",
          message: "Retrieving certification requirements...",
        });

        const certification = findCertification(certificationQuery);

        if (!certification) {
          reportEvent({
            type: "tool-result",
            toolName: "getCertificationRequirements",
            summary: "No matching certification was found.",
          });

          return {
            found: false,
            message: `No certification matched "${certificationQuery}".`,
          };
        }

        const requiredCourses = getCoursesByIds(
          certification.requiredCourseIds,
        );

        reportEvent({
          type: "tool-result",
          toolName: "getCertificationRequirements",
          summary: `${requiredCourses.length} required courses found.`,
        });

        return {
          found: true,
          certification,
          requiredCourses,
        };
      },
    }),

    getCertificationCourses: tool({
      description:
        "Get the full course catalog required for a certification using its certification ID.",

      inputSchema: z.object({
        certificationId: z
          .string()
          .describe("The certification ID, such as cert-cloud-security."),
      }),

      execute: async ({ certificationId }) => {
        reportEvent({
          type: "tool-start",
          toolName: "getCertificationCourses",
          message: "Loading available certification courses...",
        });

        const certification = findCertificationById(certificationId);

        if (!certification) {
          reportEvent({
            type: "tool-result",
            toolName: "getCertificationCourses",
            summary: "Certification courses were not found.",
          });

          return {
            found: false,
            message: `No certification was found with ID ${certificationId}.`,
            courses: [],
          };
        }

        const certificationCourses = getCoursesByIds(
          certification.requiredCourseIds,
        );

        reportEvent({
          type: "tool-result",
          toolName: "getCertificationCourses",
          summary: `${certificationCourses.length} certification courses loaded.`,
        });

        return {
          found: true,
          certificationId,
          courses: certificationCourses,
        };
      },
    }),
  };
}

export type CertificationTools = ReturnType<typeof createCertificationTools>;
