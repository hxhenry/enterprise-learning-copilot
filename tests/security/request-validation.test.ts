import { describe, expect, it } from "vitest";

import { parseSafeIdentifier } from "@/lib/security/request-validation";

describe("parseSafeIdentifier", () => {
  it("accepts UUID-like identifiers", () => {
    expect(
      parseSafeIdentifier(
        "34c1bbaa-a4ec-45ce-ae29-7bf980a22c10",
      ),
    ).toBe(
      "34c1bbaa-a4ec-45ce-ae29-7bf980a22c10",
    );
  });

  it("accepts letters, numbers, underscores, and hyphens", () => {
    expect(
      parseSafeIdentifier(
        "thread_user-001",
      ),
    ).toBe("thread_user-001");
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseSafeIdentifier("  action-123  "),
    ).toBe("action-123");
  });

  it.each([
    null,
    undefined,
    123,
    "",
    "contains spaces",
    "../unsafe-path",
    "<script>",
    "a".repeat(101),
  ])("rejects unsafe value: %s", (value) => {
    expect(
      parseSafeIdentifier(value),
    ).toBeNull();
  });
});