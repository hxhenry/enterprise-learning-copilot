import { describe, expect, it } from "vitest";

import {
  createCheckpointThreadId,
  createWorkflowLockKey,
} from "@/lib/security/checkpoint-thread";

describe("checkpoint thread identity", () => {
  it("creates a deterministic actor-scoped checkpoint ID", () => {
    const checkpointThreadId = createCheckpointThreadId(
      "user-001",
      "thread-123",
    );

    expect(checkpointThreadId).toMatch(/^checkpoint:v1:[a-f0-9]{64}$/);
    expect(
      createCheckpointThreadId("user-001", "thread-123"),
    ).toBe(checkpointThreadId);
    expect(checkpointThreadId).not.toContain("user-001");
    expect(checkpointThreadId).not.toContain("thread-123");
  });

  it("isolates identical client thread IDs between actors", () => {
    expect(createCheckpointThreadId("user-001", "thread-123")).not.toBe(
      createCheckpointThreadId("user-002", "thread-123"),
    );
  });

  it("uses one workflow lock for every operation on a checkpoint thread", () => {
    const checkpointThreadId = createCheckpointThreadId(
      "user-001",
      "thread-123",
    );

    expect(createWorkflowLockKey(checkpointThreadId)).toBe(
      `workflow:v1:${checkpointThreadId}`,
    );
  });

  it("normalizes safe identifiers", () => {
    expect(
      createCheckpointThreadId(" user-001 ", " thread-123 "),
    ).toBe(createCheckpointThreadId("user-001", "thread-123"));
  });

  it.each([
    ["", "thread-123"],
    ["user 001", "thread-123"],
    ["user-001", ""],
    ["user-001", "../thread"],
    ["a".repeat(101), "thread-123"],
  ])("rejects an unsafe actor/thread pair: %s %s", (actorId, threadId) => {
    expect(() => createCheckpointThreadId(actorId, threadId)).toThrow(
      "A safe checkpoint identifier is required.",
    );
  });
});
