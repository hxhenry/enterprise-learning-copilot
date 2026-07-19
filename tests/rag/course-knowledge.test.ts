// @vitest-environment node

import { Document } from "@langchain/core/documents";
import { describe, expect, it } from "vitest";

import {
  COURSE_KNOWLEDGE_MIN_SIMILARITY,
  selectRelevantCourseKnowledge,
} from "@/lib/rag/course-knowledge";

function createDocument(
  content: string,
  source: string,
  title: string,
) {
  return new Document({
    pageContent: content,
    metadata: {
      source,
      title,
      category: "course",
    },
  });
}

describe("course knowledge relevance filtering", () => {
  it("keeps only finite scores at or above the similarity threshold", () => {
    const relevant = createDocument(
      "Least privilege grants only the access required.",
      "identity-access-management.md",
      "Identity and Access Management",
    );
    const boundary = createDocument(
      "The passing score is 80 percent.",
      "certification-policy.md",
      "Cloud Security Certification Policy",
    );
    const unrelated = createDocument(
      "Cloud networks should use segmentation.",
      "cloud-security-fundamentals.md",
      "Cloud Security Fundamentals",
    );

    const passages = selectRelevantCourseKnowledge([
      [relevant, 0.82],
      [unrelated, COURSE_KNOWLEDGE_MIN_SIMILARITY - 0.01],
      [boundary, COURSE_KNOWLEDGE_MIN_SIMILARITY],
      [unrelated, Number.NaN],
    ]);

    expect(passages).toEqual([
      expect.objectContaining({
        citationId: "S1",
        source: "identity-access-management.md",
      }),
      expect.objectContaining({
        citationId: "S2",
        source: "certification-policy.md",
      }),
    ]);
  });

  it("returns no passages when every candidate is below the threshold", () => {
    const unrelated = createDocument(
      "Certification records are process-local in this demo.",
      "certification-policy.md",
      "Cloud Security Certification Policy",
    );

    expect(
      selectRelevantCourseKnowledge([
        [unrelated, COURSE_KNOWLEDGE_MIN_SIMILARITY - 0.2],
      ]),
    ).toEqual([]);
  });
});
