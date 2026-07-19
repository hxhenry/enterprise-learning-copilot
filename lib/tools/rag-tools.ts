import { tool } from "ai";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import type { RetrievedKnowledge } from "@/lib/domain/knowledge";
import type { AgentEventReporter } from "@/lib/schemas/events";
import type { KnowledgeRepository } from "@/lib/repositories/contracts";
import { inMemoryKnowledgeRepository } from "@/lib/repositories/in-memory-repositories";

function toSourceExperienceItem(passage: RetrievedKnowledge) {
  return {
    citationId: passage.citationId,
    title: passage.title,
    source: passage.source,
    category: passage.category,
    excerpt: passage.content
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180),
  };
}

/** Extracts only the supported inline citation syntax, preserving first use. */
export function extractCitationIds(answer: string): string[] {
  const citationIds: string[] = [];
  const seen = new Set<string>();

  for (const match of answer.matchAll(
    /\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g,
  )) {
    for (const citationId of match[1]?.match(/S\d+/g) ?? []) {
      if (!seen.has(citationId)) {
        seen.add(citationId);
        citationIds.push(citationId);
      }
    }
  }

  return citationIds;
}

export function createRagToolSession(
  reportEvent: AgentEventReporter,
  repository: KnowledgeRepository = inMemoryKnowledgeRepository,
) {
  /*
   * Repository-local IDs may restart at S1 on every search. Remapping them in
   * this agent run prevents collisions when the model invokes retrieval more
   * than once before producing its answer.
   */
  const passagesByCitationId = new Map<string, RetrievedKnowledge>();
  let nextCitationNumber = 1;

  const tools = {
    searchCourseKnowledge: tool({
      description:
        "Search the available internal course and certification policy documents. Use this tool for supported course concepts, security topics, assessment policy, retake rules, certification validity, manager reporting, or when the user explicitly asks for internal references. It does not search the web or general React documentation.",

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
          const retrievedPassages = await repository.searchCourseKnowledge(
            query,
            limit,
          );

          if (retrievedPassages.length === 0) {
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
                "The internal learning documents do not cover this topic. If you provide a general explanation, clearly label it as model knowledge and do not cite internal sources.",
            };
          }

          const passages = retrievedPassages.map((passage) => {
            const citationId = `S${nextCitationNumber}`;
            nextCitationNumber += 1;

            const sessionPassage = {
              ...passage,
              citationId,
            };

            passagesByCitationId.set(citationId, sessionPassage);

            return sessionPassage;
          });

          const uniqueSourceCount = new Set(
            passages.map((passage) => passage.source),
          ).size;

          reportEvent({
            type: "tool-result",
            toolName: "searchCourseKnowledge",
            summary: `Found ${passages.length} relevant passages from ${uniqueSourceCount} source document${uniqueSourceCount === 1 ? "" : "s"}.`,
          });

          return {
            found: true,
            query,
            citationInstructions:
              "Cite each supported claim inline using its passage citationId in square brackets, such as [S1]. Do not add a separate Sources section because the application renders cited passages as structured evidence.",
            passages,
          };
        } catch (error) {
          // Provider details stay in server logs; tool output is model-visible.
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

  return {
    tools,
    publishCitedSources(answer: string) {
      /*
       * Publication is intentionally deferred until generation completes.
       * Intersecting answer citations with the run registry removes unused and
       * fabricated IDs; it validates provenance, not claim-level entailment.
       */
      const sources = extractCitationIds(answer)
        .map((citationId) => passagesByCitationId.get(citationId))
        .filter(
          (passage): passage is RetrievedKnowledge => passage !== undefined,
        )
        .map(toSourceExperienceItem);

      if (sources.length === 0) {
        return;
      }

      reportEvent({
        type: "experience",
        block: {
          id: `sources-${randomUUID()}`,
          kind: "sources",
          sources,
        },
      });
    },
  };
}
