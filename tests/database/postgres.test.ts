// @vitest-environment node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { parseServerEnvironment } from "@/lib/config/server-environment";
import {
  checkPostgresReadiness,
  createPostgresPool,
  createPostgresWorkflowLockPool,
  getSharedPostgresPool,
  getSharedPostgresWorkflowLockPool,
  PostgresConfigurationError,
  PostgresReadinessError,
  REQUIRED_APP_MIGRATIONS,
  REQUIRED_CHECKPOINT_MIGRATIONS,
  REQUIRED_POSTGRES_RELATIONS,
} from "@/lib/database/postgres";

const postgresGlobal = globalThis as typeof globalThis & {
  learningCopilotPostgresPool?: { pool: Pool };
  learningCopilotWorkflowLockPool?: { pool: Pool };
};

async function clearSharedPool(): Promise<void> {
  const pools = [
    postgresGlobal.learningCopilotPostgresPool?.pool,
    postgresGlobal.learningCopilotWorkflowLockPool?.pool,
  ];

  delete postgresGlobal.learningCopilotPostgresPool;
  delete postgresGlobal.learningCopilotWorkflowLockPool;

  for (const pool of pools) {
    if (pool && !pool.ended) {
      await pool.end();
    }
  }
}

function postgresEnvironment() {
  return parseServerEnvironment({
    OPENAI_API_KEY: "test-key",
    PERSISTENCE_BACKEND: "postgres",
    DATABASE_URL:
      "postgresql://learning:database-secret@localhost:5432/learning",
    POSTGRES_SCHEMA: "learning_runtime",
    POSTGRES_POOL_MAX: "8",
    POSTGRES_WORKFLOW_LOCK_POOL_MAX: "3",
    POSTGRES_CONNECTION_TIMEOUT_MS: "1500",
    POSTGRES_IDLE_TIMEOUT_MS: "20000",
    POSTGRES_STATEMENT_TIMEOUT_MS: "25000",
  });
}

describe("PostgreSQL pool", () => {
  beforeEach(clearSharedPool);

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await clearSharedPool();
  });

  it("applies bounded pool, timeout, and schema settings", async () => {
    const pool = createPostgresPool(postgresEnvironment());

    expect(pool.options.max).toBe(8);
    expect(pool.options.connectionTimeoutMillis).toBe(1500);
    expect(pool.options.idleTimeoutMillis).toBe(20000);
    expect(pool.options.statement_timeout).toBe(25000);
    expect(pool.options.query_timeout).toBe(25000);
    expect(pool.options.options).toBe(
      "-c search_path=learning_runtime",
    );

    await pool.end();
  });

  it("uses a separately bounded pool for workflow lock sessions", async () => {
    const environment = postgresEnvironment();
    const applicationPool = getSharedPostgresPool(environment);
    const lockPool = getSharedPostgresWorkflowLockPool(environment);

    expect(lockPool).not.toBe(applicationPool);
    expect(lockPool.options.max).toBe(3);
    expect(lockPool.options.application_name).toBe(
      "enterprise-learning-copilot-workflow-locks",
    );
    expect(applicationPool.options.max).toBe(8);
  });

  it("rejects pool creation for the memory backend", () => {
    const environment = parseServerEnvironment({
      OPENAI_API_KEY: "test-key",
    });

    expect(() => createPostgresPool(environment)).toThrow(
      PostgresConfigurationError,
    );
    expect(() => createPostgresWorkflowLockPool(environment)).toThrow(
      PostgresConfigurationError,
    );
  });

  it("shares one pool for identical configuration", () => {
    const environment = postgresEnvironment();

    const firstPool = getSharedPostgresPool(environment);
    const secondPool = getSharedPostgresPool(environment);

    expect(secondPool).toBe(firstPool);
  });

  it("rejects a conflicting shared-pool configuration without leaking its URL", () => {
    getSharedPostgresPool(postgresEnvironment());
    const conflictingEnvironment = parseServerEnvironment({
      OPENAI_API_KEY: "test-key",
      PERSISTENCE_BACKEND: "postgres",
      DATABASE_URL:
        "postgresql://learning:other-secret@localhost:5432/other",
    });

    expect(() =>
      getSharedPostgresPool(conflictingEnvironment),
    ).toThrow("different settings");

    try {
      getSharedPostgresPool(conflictingEnvironment);
    } catch (error) {
      expect(String(error)).not.toContain("other-secret");
    }
  });

  it("replaces a shared pool after graceful shutdown", async () => {
    const environment = postgresEnvironment();
    const firstPool = getSharedPostgresPool(environment);

    await firstPool.end();

    const replacementPool = getSharedPostgresPool(environment);

    expect(replacementPool).not.toBe(firstPool);
  });

  it("loads shared-pool configuration without model credentials", () => {
    vi.stubEnv("PERSISTENCE_BACKEND", "postgres");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://learning:secret@localhost:5432/learning",
    );

    expect(getSharedPostgresPool()).toBeInstanceOf(Pool);
  });

  it("logs idle-client failures without exposing the database error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const pool = createPostgresPool(postgresEnvironment());

    pool.emit(
      "error",
      new Error(
        "postgresql://learning:database-secret@localhost/learning",
      ),
      {} as never,
    );

    expect(consoleError).toHaveBeenCalledOnce();
    expect(String(consoleError.mock.calls[0]?.[0])).toContain(
      "postgres.idle-client.failed",
    );
    expect(String(consoleError.mock.calls[0]?.[0])).not.toContain(
      "database-secret",
    );

    await pool.end();
  });
});

describe("PostgreSQL readiness", () => {
  it("keeps the readiness manifest aligned with application migration files", async () => {
    const migrationsDirectory = path.join(
      process.cwd(),
      "database",
      "migrations",
    );
    const migrationFileNames = (await readdir(migrationsDirectory))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    expect(migrationFileNames).toEqual(
      REQUIRED_APP_MIGRATIONS.map(({ id }) => id),
    );

    for (const migration of REQUIRED_APP_MIGRATIONS) {
      const sql = await readFile(
        path.join(migrationsDirectory, migration.id),
        "utf8",
      );
      const checksum = createHash("sha256")
        .update(sql, "utf8")
        .digest("hex");

      expect(checksum).toBe(migration.checksum);
    }
  });

  it("accepts a fully migrated configured schema", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: REQUIRED_POSTGRES_RELATIONS.map((table_name) => ({
            table_name,
          })),
        };
      }

      if (sql.includes("app_schema_migrations")) {
        return {
          rows: REQUIRED_APP_MIGRATIONS.map(({ id, checksum }) => ({
            migration_id: id,
            checksum,
          })),
        };
      }

      return {
        rows: REQUIRED_CHECKPOINT_MIGRATIONS.map((v) => ({ v })),
      };
    }) as unknown as Pool["query"];
    const pool = { query } as unknown as Pool;

    await expect(
      checkPostgresReadiness(pool, "learning_runtime"),
    ).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("information_schema.tables"),
      ["learning_runtime", [...REQUIRED_POSTGRES_RELATIONS]],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM "learning_runtime".app_schema_migrations',
      ),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM "learning_runtime".checkpoint_migrations',
      ),
    );
  });

  it.each([
    {
      name: "application checksum",
      appRows: [
        {
          migration_id: REQUIRED_APP_MIGRATIONS[0].id,
          checksum: "stale-checksum",
        },
      ],
      checkpointRows: REQUIRED_CHECKPOINT_MIGRATIONS.map((v) => ({ v })),
    },
    {
      name: "checkpoint migration level",
      appRows: REQUIRED_APP_MIGRATIONS.map(({ id, checksum }) => ({
        migration_id: id,
        checksum,
      })),
      checkpointRows: REQUIRED_CHECKPOINT_MIGRATIONS.slice(0, -1).map(
        (v) => ({ v }),
      ),
    },
  ])("rejects a stale $name", async ({ appRows, checkpointRows }) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("information_schema.tables")) {
        return {
          rows: REQUIRED_POSTGRES_RELATIONS.map((table_name) => ({
            table_name,
          })),
        };
      }

      return {
        rows: sql.includes("app_schema_migrations")
          ? appRows
          : checkpointRows,
      };
    }) as unknown as Pool["query"];
    const pool = { query } as unknown as Pool;

    await expect(
      checkPostgresReadiness(pool, "learning_runtime"),
    ).rejects.toBeInstanceOf(PostgresReadinessError);
  });

  it("reports every required relation missing from an incomplete schema", async () => {
    const query = vi.fn(async () => ({
      rows: [
        { table_name: "course_enrollments" },
        { table_name: "checkpoints" },
      ],
    })) as unknown as Pool["query"];
    const pool = { query } as unknown as Pool;

    let readinessError: PostgresReadinessError | undefined;

    try {
      await checkPostgresReadiness(pool, "learning_runtime");
    } catch (error) {
      if (error instanceof PostgresReadinessError) {
        readinessError = error;
      }
    }

    expect(readinessError).toBeInstanceOf(PostgresReadinessError);
    expect(readinessError?.missingRelations).toEqual(
      REQUIRED_POSTGRES_RELATIONS.filter(
        (relation) =>
          relation !== "course_enrollments" &&
          relation !== "checkpoints",
      ),
    );
    expect(String(readinessError)).not.toContain("database-secret");
  });

  it("propagates connectivity failures without claiming readiness", async () => {
    const databaseError = new Error("database unavailable");
    const query = vi.fn(async () => {
      throw databaseError;
    }) as unknown as Pool["query"];
    const pool = { query } as unknown as Pool;

    await expect(
      checkPostgresReadiness(pool, "learning_runtime"),
    ).rejects.toBe(databaseError);
  });
});
