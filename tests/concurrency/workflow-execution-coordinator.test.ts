import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  InMemoryWorkflowExecutionCoordinator,
  PostgresWorkflowExecutionCoordinator,
  WorkflowExecutionAbortedError,
  WorkflowLockReleaseError,
  WorkflowLockTimeoutError,
} from "@/lib/concurrency/workflow-execution-coordinator";
import { PersistenceOperationError } from "@/lib/database/errors";

function createDeferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

function queryResult<Row extends Record<string, unknown>>(
  row: Row,
): QueryResult<Row> {
  return { rows: [row] } as QueryResult<Row>;
}

function createPool(
  query: ReturnType<typeof vi.fn>,
  release = vi.fn(),
) {
  const client = {
    query,
    release,
  } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;

  return { pool, client, release };
}

describe("InMemoryWorkflowExecutionCoordinator", () => {
  it("serializes operations sharing a workflow key", async () => {
    const coordinator = new InMemoryWorkflowExecutionCoordinator();
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const order: string[] = [];

    const first = coordinator.run("workflow-123", async () => {
      order.push("first-start");
      firstStarted.resolve();
      await releaseFirst.promise;
      order.push("first-end");
    });

    await firstStarted.promise;

    const second = coordinator.run("workflow-123", async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("does not start queued work after cancellation", async () => {
    const coordinator = new InMemoryWorkflowExecutionCoordinator();
    const controller = new AbortController();
    controller.abort();

    await expect(
      coordinator.run("workflow-123", async () => "not-run", {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(WorkflowExecutionAbortedError);
  });
});

describe("PostgresWorkflowExecutionCoordinator", () => {
  it("holds and releases a session advisory lock around the operation", async () => {
    const order: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) {
        order.push("lock");
        return queryResult({ acquired: true });
      }

      order.push("unlock");
      return queryResult({ released: true });
    });
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("actor-thread", async () => {
        order.push("operation");
        return "complete";
      }),
    ).resolves.toBe("complete");

    expect(order).toEqual(["lock", "operation", "unlock"]);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("pg_try_advisory_lock"),
      ["actor-thread"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("pg_advisory_unlock"),
      ["actor-thread"],
    );
    expect(release).toHaveBeenCalledWith(false);
  });

  it("unlocks and returns the client after the operation fails", async () => {
    const operationError = new Error("operation failed");
    const query = vi.fn(async (sql: string) =>
      sql.includes("pg_try_advisory_lock")
        ? queryResult({ acquired: true })
        : queryResult({ released: true }),
    );
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("actor-thread", async () => {
        throw operationError;
      }),
    ).rejects.toBe(operationError);

    expect(query).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("destroys a client that cannot release its advisory lock", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(queryResult({ acquired: true }))
      .mockRejectedValueOnce(new Error("connection failed"));
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("actor-thread", async () => "complete"),
    ).rejects.toBeInstanceOf(WorkflowLockReleaseError);

    expect(release).toHaveBeenCalledWith(true);
  });

  it("polls until the advisory lock becomes available", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(queryResult({ acquired: false }))
      .mockResolvedValueOnce(queryResult({ acquired: true }))
      .mockResolvedValueOnce(queryResult({ released: true }));
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool, {
      lockTimeoutMs: 100,
      pollIntervalMs: 1,
    });

    await expect(
      coordinator.run("actor-thread", async () => "complete"),
    ).resolves.toBe("complete");

    expect(query).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("fails within the configured acquisition deadline", async () => {
    const query = vi.fn(async () => queryResult({ acquired: false }));
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool, {
      lockTimeoutMs: 10,
      pollIntervalMs: 1,
    });

    const startedAt = Date.now();

    await expect(
      coordinator.run("private-actor-thread", async () => "not-run"),
    ).rejects.toBeInstanceOf(WorkflowLockTimeoutError);

    expect(Date.now() - startedAt).toBeLessThan(200);
    expect(release).toHaveBeenCalledWith(true);

    try {
      await coordinator.run(
        "private-actor-thread",
        async () => "not-run",
      );
    } catch (error) {
      expect(String(error)).not.toContain("private-actor-thread");
    }
  });

  it("aborts while polling without running the operation", async () => {
    const controller = new AbortController();
    const operation = vi.fn(async () => "not-run");
    const query = vi.fn(async () => {
      controller.abort();
      return queryResult({ acquired: false });
    });
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool, {
      lockTimeoutMs: 100,
      pollIntervalMs: 1,
    });

    await expect(
      coordinator.run("actor-thread", operation, {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(WorkflowExecutionAbortedError);

    expect(operation).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith(true);
  });

  it("destroys a client after an uncertain lock acquisition failure", async () => {
    const query = vi.fn(async () => {
      throw new Error("connection lost");
    });
    const { pool, release } = createPool(query);
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("actor-thread", async () => "not-run"),
    ).rejects.toBeInstanceOf(PersistenceOperationError);

    expect(release).toHaveBeenCalledWith(true);
  });

  it("marks pool checkout failures as persistence errors", async () => {
    const pool = {
      connect: vi.fn(async () => {
        throw new Error("timeout exceeded when trying to connect");
      }),
    } as unknown as Pool;
    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("actor-thread", async () => "not-run"),
    ).rejects.toMatchObject({
      name: "PersistenceOperationError",
      retryable: true,
    });
  });

  it("rejects empty keys and invalid timeout settings", async () => {
    const query = vi.fn();
    const { pool } = createPool(query);

    expect(
      () =>
        new PostgresWorkflowExecutionCoordinator(pool, {
          lockTimeoutMs: 0,
        }),
    ).toThrow("positive integer milliseconds");

    const coordinator = new PostgresWorkflowExecutionCoordinator(pool);

    await expect(
      coordinator.run("   ", async () => "not-run"),
    ).rejects.toThrow("A workflow execution key is required.");
  });
});
