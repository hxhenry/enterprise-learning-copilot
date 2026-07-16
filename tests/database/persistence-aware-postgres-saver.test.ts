// @vitest-environment node

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isPersistenceError,
  isRetryablePersistenceError,
} from "@/lib/database/persistence-error";
import { PersistenceAwarePostgresSaver } from "@/lib/database/persistence-aware-postgres-saver";

const config = {
  configurable: {
    thread_id: "thread-123",
  },
};

function createSaver(): PersistenceAwarePostgresSaver {
  return new PersistenceAwarePostgresSaver({} as Pool);
}

describe("PersistenceAwarePostgresSaver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["setup", () => createSaver().setup()],
    ["getTuple", () => createSaver().getTuple(config)],
    [
      "put",
      () => createSaver().put(config, {} as never, {} as never, {}),
    ],
    [
      "putWrites",
      () => createSaver().putWrites(config, [], "task-123"),
    ],
    ["deleteThread", () => createSaver().deleteThread("thread-123")],
  ] as const)("marks %s database failures at the checkpointer boundary", async (
    method,
    operation,
  ) => {
    const databaseError = Object.assign(new Error("database secret"), {
      code: "ECONNRESET",
    });

    vi.spyOn(PostgresSaver.prototype, method).mockRejectedValueOnce(
      databaseError as never,
    );

    let receivedError: unknown;

    try {
      await operation();
    } catch (error) {
      receivedError = error;
    }

    expect(isPersistenceError(receivedError)).toBe(true);
    expect(isRetryablePersistenceError(receivedError)).toBe(true);
    expect(String(receivedError)).not.toContain("database secret");
  });

  it("marks failures raised while iterating checkpoint lists", async () => {
    const databaseError = Object.assign(new Error("database secret"), {
      code: "08006",
    });

    vi.spyOn(PostgresSaver.prototype, "list").mockImplementation(
      async function* () {
        throw databaseError;
      },
    );

    let receivedError: unknown;

    try {
      await createSaver().list(config).next();
    } catch (error) {
      receivedError = error;
    }

    expect(isPersistenceError(receivedError)).toBe(true);
    expect(isRetryablePersistenceError(receivedError)).toBe(true);
  });
});
