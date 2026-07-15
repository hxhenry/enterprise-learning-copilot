import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { searchCourseKnowledge } from "@/lib/rag/course-knowledge";
import type { AgentEvent } from "@/lib/schemas/events";

type AgentEventReporter = (event: AgentEvent) => void;

export function createRagTools(reportEvent: AgentEventReporter) {
  return {
    searchCourseKnowledge: tool({
      description:
        "Search internal course and certification policy documents. Use this tool when answering questions about course concepts, security topics, assessment policy, retake rules, certification validity, or manager reporting.",

      inputSchema: z.object({
        query: z
          .string()
          .min(3)
          .describe(
            "A focused semantic search query based on the user's question.",
          ),

        limit: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe("The maximum number of relevant passages to retrieve."),
      }),

      execute: async ({ query, limit }) => {
        reportEvent({
          type: "tool-start",
          toolName: "searchCourseKnowledge",
          message: "Searching course knowledge...",
        });

        try {
          const passages = await searchCourseKnowledge(query, limit);

          if (passages.length === 0) {
            reportEvent({
              type: "tool-result",
              toolName: "searchCourseKnowledge",
              summary: "No relevant course passages were found.",
            });

            return {
              found: false,
              query,
              passages: [],
              message:
                "No relevant information was found in the available documents.",
            };
          }

          const uniqueSourceCount = new Set(
            passages.map((passage) => passage.source),
          ).size;

          reportEvent({
            type: "tool-result",
            toolName: "searchCourseKnowledge",
            summary: `Found ${passages.length} relevant passages from ${uniqueSourceCount} source document${uniqueSourceCount === 1 ? "" : "s"}.`,
          });
          
          reportEvent({
            type: "experience",
            block: {
              id: `sources-${randomUUID()}`,
              kind: "sources",
              sources: passages.map((passage) => ({
                citationId: passage.citationId,
                title: passage.title,
                source: passage.source,
                category: passage.category,
                excerpt: passage.content
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 180),
              })),
            },
          });

          return {
            found: true,
            query,
            citationInstructions:
              "When using a passage, cite its citationId in square brackets, such as [S1]. Include a Sources section mapping each citation ID to its title.",
            passages,
          };
        } catch (error) {
          console.error("Course knowledge retrieval failed:", error);

          reportEvent({
            type: "tool-result",
            toolName: "searchCourseKnowledge",
            summary: "Course knowledge search failed.",
          });

          return {
            found: false,
            query,
            passages: [],
            message: "The course knowledge service is temporarily unavailable.",
          };
        }
      },
    }),
  };
}

export type RagTools = ReturnType<typeof createRagTools>;
