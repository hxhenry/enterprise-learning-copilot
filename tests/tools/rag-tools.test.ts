import { afterEach, describe, expect, it, vi } from "vitest";

import type { KnowledgeRepository } from "@/lib/repositories/contracts";
import type { AgentEventPayload } from "@/lib/schemas/events";
import {
  createRagToolSession,
  extractCitationIds,
} from "@/lib/tools/rag-tools";
import { executeTool } from "@/tests/tools/tool-test-helper";

describe("RAG tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes only passages cited by the completed answer", async () => {
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
        {
          citationId: "repository-S2",
          title: "Cloud Security Fundamentals",
          source: "cloud-security-fundamentals.md",
          category: "course",
          content: "Security groups should permit only required traffic.",
        },
      ]),
    };
    const session = createRagToolSession(
      (event) => events.push(event),
      repository,
    );

    const result = await executeTool<
      { query: string; limit: number },
      { found: boolean; passages: Array<{ citationId: string }> }
    >(session.tools.searchCourseKnowledge, {
      query: "least privilege",
      limit: 3,
    });

    expect(result).toMatchObject({
      found: true,
      passages: [{ citationId: "S1" }, { citationId: "S2" }],
    });
    expect(
      events.find((event) => event.type === "experience"),
    ).toBeUndefined();

    session.publishCitedSources(
      "Required traffic should be narrowly scoped [S2]. Unknown [S99].",
    );

    expect(events.find((event) => event.type === "experience")).toMatchObject({
      block: {
        kind: "sources",
        sources: [
          {
            citationId: "S2",
            title: "Cloud Security Fundamentals",
          },
        ],
      },
    });
  });

  it("does not attach local references to an out-of-domain useRef answer", async () => {
    const events: AgentEventPayload[] = [];
    const session = createRagToolSession(
      (event) => events.push(event),
      {
        searchCourseKnowledge: async () => [],
      },
    );

    const result = await executeTool<
      { query: string; limit: number },
      { found: boolean; passages: unknown[]; message: string }
    >(session.tools.searchCourseKnowledge, {
      query: "What is React useRef?",
      limit: 3,
    });

    session.publishCitedSources(
      "The internal documents do not cover useRef. General explanation [S1].",
    );

    expect(result).toMatchObject({
      found: false,
      passages: [],
      message: expect.stringContaining(
        "internal learning documents do not cover this topic",
      ),
    });
    expect(events.some((event) => event.type === "experience")).toBe(false);
  });

  it("assigns unique citation IDs across repeated searches", async () => {
    const session = createRagToolSession(() => undefined, {
      searchCourseKnowledge: async (query) => [
        {
          citationId: "repository-S1",
          title: query,
          source: `${query}.md`,
          category: "course",
          content: `${query} content`,
        },
      ],
    });

    const firstResult = await executeTool<
      { query: string; limit: number },
      { passages: Array<{ citationId: string }> }
    >(session.tools.searchCourseKnowledge, {
      query: "least privilege",
      limit: 1,
    });
    const secondResult = await executeTool<
      { query: string; limit: number },
      { passages: Array<{ citationId: string }> }
    >(session.tools.searchCourseKnowledge, {
      query: "retake policy",
      limit: 1,
    });

    expect(firstResult.passages[0]?.citationId).toBe("S1");
    expect(secondResult.passages[0]?.citationId).toBe("S2");
  });

  it("extracts ordered, unique inline citation IDs", () => {
    expect(
      extractCitationIds(
        "First claim [S2, S1], repeated [S2], and separate [S3; S4].",
      ),
    ).toEqual(["S2", "S1", "S3", "S4"]);
  });

  it("handles failed retrieval without leaking internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failedSession = createRagToolSession(() => undefined, {
      searchCourseKnowledge: async () => {
        throw new Error("embedding-provider-secret");
      },
    });

    const failedResult = await executeTool<
      { query: string; limit: number },
      { found: boolean; message: string }
    >(failedSession.tools.searchCourseKnowledge, {
      query: "least privilege",
      limit: 3,
    });

    expect(failedResult).toEqual({
      found: false,
      query: "least privilege",
      passages: [],
      message: "The course knowledge service is temporarily unavailable.",
    });
  });
});
