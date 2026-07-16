import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeRepository } from "@/lib/repositories/contracts";
import type { AgentEventPayload } from "@/lib/schemas/events";
import { createRagTools } from "@/lib/tools/rag-tools";
import { executeTool } from "@/tests/tools/tool-test-helper";

describe("RAG tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cited passages and a trusted source block", async () => {
    const events: AgentEventPayload[] = [];
    const repository: KnowledgeRepository = {
      searchCourseKnowledge: vi.fn(async () => [
        {
          citationId: "S1",
          title: "Identity and Access Management",
          source: "identity-access-management.md",
          category: "course",
          content: "Least privilege limits access to what a user needs.",
        },
      ]),
    };
    const tools = createRagTools(
      (event) => events.push(event),
      repository,
    );

    const result = await executeTool<
      { query: string; limit: number },
      { found: boolean; passages: Array<{ citationId: string }> }
    >(tools.searchCourseKnowledge, {
      query: "least privilege",
      limit: 3,
    });

    expect(result).toMatchObject({
      found: true,
      passages: [{ citationId: "S1" }],
    });
    expect(
      events.find((event) => event.type === "experience"),
    ).toMatchObject({
      block: {
        kind: "sources",
        sources: [
          {
            citationId: "S1",
            title: "Identity and Access Management",
          },
        ],
      },
    });
  });

  it("handles empty and failed retrieval without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const emptyTools = createRagTools(() => undefined, {
      searchCourseKnowledge: async () => [],
    });
    const failedTools = createRagTools(() => undefined, {
      searchCourseKnowledge: async () => {
        throw new Error("embedding-provider-secret");
      },
    });

    const emptyResult = await executeTool<
      { query: string; limit: number },
      { found: boolean; passages: unknown[] }
    >(emptyTools.searchCourseKnowledge, {
      query: "unknown topic",
      limit: 3,
    });
    const failedResult = await executeTool<
      { query: string; limit: number },
      { found: boolean; message: string }
    >(failedTools.searchCourseKnowledge, {
      query: "least privilege",
      limit: 3,
    });

    expect(emptyResult).toMatchObject({
      found: false,
      passages: [],
    });
    expect(failedResult).toEqual({
      found: false,
      query: "least privilege",
      passages: [],
      message: "The course knowledge service is temporarily unavailable.",
    });
  });
});
