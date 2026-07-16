// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Pool, PoolClient, QueryResult } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseMigrationError } from "@/lib/database/errors";
import {
  runDatabaseMigrationBatch,
  runDatabaseMigrations,
} from "@/lib/database/migrations";

const temporaryDirectories: string[] = [];

function result<Row extends Record<string, unknown>>(
  rows: Row[] = [],
): QueryResult<Row> {
  return { rows } as QueryResult<Row>;
}

async function createMigrationsDirectory(
  files: Record<string, string>,
): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "learning-copilot-migrations-"),
  );
  temporaryDirectories.push(directory);

  await Promise.all(
    Object.entries(files).map(([fileName, sql]) =>
      writeFile(path.join(directory, fileName), sql, "utf8"),
    ),
  );

  return directory;
}

function createPool(
  handler: (sql: string, values?: unknown[]) => Promise<QueryResult<never>>,
) {
  const release = vi.fn();
  const query = vi.fn(handler);
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;

  return { pool, query, release };
}

function createDeferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

class TestAdvisoryLock {
  private owner: string | undefined;
  private readonly waiters: Array<{
    owner: string;
    resolve: () => void;
  }> = [];
  readonly contended = createDeferred();

  async acquire(owner: string): Promise<void> {
    if (!this.owner) {
      this.owner = owner;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push({ owner, resolve });
      this.contended.resolve();
    });
  }

  release(owner: string): boolean {
    if (this.owner !== owner) {
      return false;
    }

    const next = this.waiters.shift();
    this.owner = next?.owner;
    next?.resolve();
    return true;
  }
}

function createCoordinatedPool(
  identity: string,
  advisoryLock: TestAdvisoryLock,
) {
  let activeConnections = 0;
  let peakConnections = 0;
  let sessionSequence = 0;

  const connect = vi.fn(async () => {
    activeConnections += 1;
    peakConnections = Math.max(peakConnections, activeConnections);

    if (activeConnections > 2) {
      throw new Error("The test pool exhausted its configured capacity.");
    }

    sessionSequence += 1;
    const sessionId = `${identity}-${sessionSequence}`;
    let released = false;
    const client = {
      async query(sql: string) {
        if (sql === "SELECT pg_advisory_lock($1::bigint)") {
          await advisoryLock.acquire(sessionId);
          return result();
        }

        if (sql.includes("pg_advisory_unlock")) {
          return result([
            {
              released: advisoryLock.release(sessionId),
            },
          ]);
        }

        return result();
      },
      release() {
        if (!released) {
          released = true;
          activeConnections -= 1;
        }
      },
    } as unknown as PoolClient;

    return client;
  });
  const pool = {
    connect,
    options: {
      max: 2,
    },
  } as unknown as Pool;

  return {
    pool,
    connect,
    getPeakConnections: () => peakConnections,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("database migrations", () => {
  it("bootstraps the configured schema and applies each migration once", async () => {
    const migrationSql = "CREATE TABLE sample_record (id TEXT PRIMARY KEY);";
    const directory = await createMigrationsDirectory({
      "0001_sample_record.sql": migrationSql,
    });
    const { pool, query, release } = createPool(async (sql) => {
      if (sql.includes("FROM \"tenant_a\".app_schema_migrations")) {
        return result([]) as QueryResult<never>;
      }

      if (sql.includes("pg_advisory_unlock")) {
        return result([{ released: true }]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });

    await runDatabaseMigrations(pool, {
      migrationsDirectory: directory,
      schema: "tenant_a",
    });

    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_lock($1::bigint)",
      ["724759761123401"],
    );
    expect(query).toHaveBeenCalledWith(
      "CREATE SCHEMA IF NOT EXISTS \"tenant_a\"",
    );
    expect(query).toHaveBeenCalledWith(
      "SET LOCAL search_path TO \"tenant_a\"",
    );
    expect(query).toHaveBeenCalledWith(migrationSql);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO "tenant_a".app_schema_migrations',
      ),
      [
        "0001_sample_record.sql",
        createHash("sha256").update(migrationSql).digest("hex"),
      ],
    );
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("does not reapply a migration whose checksum is already recorded", async () => {
    const migrationSql = "CREATE TABLE sample_record (id TEXT PRIMARY KEY);";
    const migrationId = "0001_sample_record.sql";
    const checksum = createHash("sha256").update(migrationSql).digest("hex");
    const directory = await createMigrationsDirectory({
      [migrationId]: migrationSql,
    });
    const { pool, query } = createPool(async (sql) => {
      if (sql.includes("FROM \"learning_runtime\".app_schema_migrations")) {
        return result([
          {
            migration_id: migrationId,
            checksum,
          },
        ]) as QueryResult<never>;
      }

      if (sql.includes("pg_advisory_unlock")) {
        return result([{ released: true }]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });

    await runDatabaseMigrations(pool, {
      migrationsDirectory: directory,
      schema: "learning_runtime",
    });

    expect(query).not.toHaveBeenCalledWith(migrationSql);
  });

  it("rejects modified or out-of-order applied history", async () => {
    const directory = await createMigrationsDirectory({
      "0001_sample.sql": "SELECT 1;",
    });
    const { pool } = createPool(async (sql) => {
      if (sql.includes("FROM \"learning_runtime\".app_schema_migrations")) {
        return result([
          {
            migration_id: "0001_sample.sql",
            checksum: "different-checksum",
          },
        ]) as QueryResult<never>;
      }

      if (sql.includes("pg_advisory_unlock")) {
        return result([{ released: true }]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
        schema: "learning_runtime",
      }),
    ).rejects.toThrow("Checksum mismatch");
  });

  it.each<{
    files: Record<string, string>;
    message: string;
  }>([
    {
      files: {},
      message: "No database migrations",
    },
    {
      files: { "migration.sql": "SELECT 1;" },
      message: "must use the format",
    },
    {
      files: { "0002_gap.sql": "SELECT 1;" },
      message: "unique and contiguous",
    },
    {
      files: { "0001_empty.sql": "   " },
      message: "is empty",
    },
  ])("rejects an invalid migration set: $message", async ({ files, message }) => {
    const directory = await createMigrationsDirectory(files);
    const pool = { connect: vi.fn() } as unknown as Pool;

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
      }),
    ).rejects.toThrow(message);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects an unsafe schema before connecting", async () => {
    const directory = await createMigrationsDirectory({
      "0001_sample.sql": "SELECT 1;",
    });
    const pool = { connect: vi.fn() } as unknown as Pool;

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
        schema: "unsafe-schema",
      }),
    ).rejects.toBeInstanceOf(DatabaseMigrationError);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rolls back a failed migration and still releases the advisory lock", async () => {
    const directory = await createMigrationsDirectory({
      "0001_broken.sql": "BROKEN MIGRATION",
    });
    const { pool, query, release } = createPool(async (sql) => {
      if (sql.includes("FROM \"learning_runtime\".app_schema_migrations")) {
        return result([]) as QueryResult<never>;
      }

      if (sql === "BROKEN MIGRATION") {
        throw new Error("migration failed");
      }

      if (sql.includes("pg_advisory_unlock")) {
        return result([{ released: true }]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
        schema: "learning_runtime",
      }),
    ).rejects.toThrow("migration failed");
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("destroys a client when lock cleanup is uncertain", async () => {
    const directory = await createMigrationsDirectory({
      "0001_sample.sql": "SELECT 1;",
    });
    const { pool, release } = createPool(async (sql) => {
      if (sql.includes("FROM \"learning_runtime\".app_schema_migrations")) {
        return result([]) as QueryResult<never>;
      }

      if (sql.includes("pg_advisory_unlock")) {
        throw new Error("connection lost");
      }

      return result([]) as QueryResult<never>;
    });

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
        schema: "learning_runtime",
      }),
    ).rejects.toThrow("connection lost");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("destroys a client after an uncertain lock-acquisition failure", async () => {
    const directory = await createMigrationsDirectory({
      "0001_sample.sql": "SELECT 1;",
    });
    const { pool, query, release } = createPool(async (sql) => {
      if (sql.includes("pg_advisory_lock")) {
        throw new Error("lock response lost");
      }

      return result([]) as QueryResult<never>;
    });

    await expect(
      runDatabaseMigrations(pool, {
        migrationsDirectory: directory,
        schema: "learning_runtime",
      }),
    ).rejects.toThrow("lock response lost");
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("pg_advisory_unlock"),
      ),
    ).toBe(false);
    expect(release).toHaveBeenCalledWith(true);
  });
});

describe("database migration batch", () => {
  it("serializes independent migration jobs while each uses a second pool client", async () => {
    const advisoryLock = new TestAdvisoryLock();
    const firstPool = createCoordinatedPool("first", advisoryLock);
    const secondPool = createCoordinatedPool("second", advisoryLock);
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const order: string[] = [];

    const first = runDatabaseMigrationBatch(firstPool.pool, async () => {
      order.push("first-start");
      const operationClient = await firstPool.pool.connect();
      operationClient.release();
      firstStarted.resolve();
      await releaseFirst.promise;
      order.push("first-end");
      return "first-result";
    });

    await firstStarted.promise;

    const second = runDatabaseMigrationBatch(secondPool.pool, async () => {
      order.push("second-start");
      const operationClient = await secondPool.pool.connect();
      operationClient.release();
      order.push("second-end");
      return "second-result";
    });

    await advisoryLock.contended.promise;
    expect(order).toEqual(["first-start"]);

    releaseFirst.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first-result",
      "second-result",
    ]);
    expect(order).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
    expect(firstPool.connect).toHaveBeenCalledTimes(2);
    expect(secondPool.connect).toHaveBeenCalledTimes(2);
    expect(firstPool.getPeakConnections()).toBe(2);
    expect(secondPool.getPeakConnections()).toBe(2);
  });

  it("uses a lock distinct from the per-app migration lock", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) =>
      sql.includes("pg_advisory_unlock")
        ? result([{ released: true }])
        : result(),
    );
    const pool = {
      connect: vi.fn(async () => ({ query, release }) as unknown as PoolClient),
      options: { max: 2 },
    } as unknown as Pool;

    await expect(
      runDatabaseMigrationBatch(pool, async () => "complete"),
    ).resolves.toBe("complete");

    expect(query).toHaveBeenNthCalledWith(
      1,
      "SELECT pg_advisory_lock($1::bigint)",
      ["724759761123402"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_advisory_unlock($1::bigint) AS released",
      ["724759761123402"],
    );
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it("rejects a pool that cannot reserve a separate operation client", async () => {
    const connect = vi.fn();
    const pool = {
      connect,
      options: { max: 1 },
    } as unknown as Pool;

    await expect(
      runDatabaseMigrationBatch(pool, async () => undefined),
    ).rejects.toThrow("at least two connections");
    expect(connect).not.toHaveBeenCalled();
  });

  it("destroys the lock session after an uncertain acquisition", async () => {
    const operation = vi.fn(async () => "not-run");
    const release = vi.fn();
    const query = vi.fn(async () => {
      throw new Error("lock response lost");
    });
    const pool = {
      connect: vi.fn(async () => ({ query, release }) as unknown as PoolClient),
      options: { max: 2 },
    } as unknown as Pool;

    await expect(
      runDatabaseMigrationBatch(pool, operation),
    ).rejects.toThrow("lock response lost");
    expect(operation).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith(true);
  });

  it("destroys the lock session when unlock cannot be confirmed", async () => {
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result([{ released: false }]));
    const pool = {
      connect: vi.fn(async () => ({ query, release }) as unknown as PoolClient),
      options: { max: 2 },
    } as unknown as Pool;

    await expect(
      runDatabaseMigrationBatch(pool, async () => "complete"),
    ).rejects.toThrow("batch lock could not be released safely");
    expect(release).toHaveBeenCalledWith(true);
  });

  it("aggregates operation and unlock failures and destroys the session", async () => {
    const operationError = new Error("migration operation failed");
    const unlockError = new Error("unlock response lost");
    const release = vi.fn();
    const query = vi
      .fn()
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(unlockError);
    const pool = {
      connect: vi.fn(async () => ({ query, release }) as unknown as PoolClient),
      options: { max: 2 },
    } as unknown as Pool;
    let receivedError: unknown;

    try {
      await runDatabaseMigrationBatch(pool, async () => {
        throw operationError;
      });
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(AggregateError);
    expect((receivedError as AggregateError).errors).toEqual([
      operationError,
      unlockError,
    ]);
    expect(release).toHaveBeenCalledWith(true);
  });
});
