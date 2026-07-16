import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Pool, PoolClient } from "pg";

import { DEFAULT_POSTGRES_SCHEMA } from "@/lib/config/server-environment";
import { DatabaseMigrationError } from "@/lib/database/errors";

const MIGRATION_FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const SAFE_POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const MIGRATION_LOCK_KEY = "724759761123401";
const MIGRATION_BATCH_LOCK_KEY = "724759761123402";
const MINIMUM_MIGRATION_BATCH_POOL_SIZE = 2;

type Migration = {
  id: string;
  checksum: string;
  sql: string;
};

type AppliedMigrationRow = {
  migration_id: string;
  checksum: string;
};

export type DatabaseMigrationOptions = {
  migrationsDirectory?: string;
  schema?: string;
};

/**
 * Holds a database-wide session lock while a complete migration batch runs.
 *
 * The lock client is intentionally kept separate from the clients used by the
 * operation. This lets app migrations retain their narrower lock and lets
 * third-party migration code, such as PostgresSaver.setup(), use the pool
 * normally while concurrent migration processes wait outside the batch.
 */
export async function runDatabaseMigrationBatch<T>(
  pool: Pool,
  operation: () => Promise<T>,
): Promise<T> {
  if (pool.options.max < MINIMUM_MIGRATION_BATCH_POOL_SIZE) {
    throw new DatabaseMigrationError(
      "The PostgreSQL migration pool must allow at least two connections.",
    );
  }

  const lockClient = await pool.connect();
  let lockAcquired = false;
  let safeToReuseClient = true;
  let operationResult: T | undefined;
  let primaryError: unknown;
  let hasPrimaryError = false;
  let unlockError: unknown;
  let hasUnlockError = false;

  try {
    safeToReuseClient = false;
    await lockClient.query("SELECT pg_advisory_lock($1::bigint)", [
      MIGRATION_BATCH_LOCK_KEY,
    ]);
    lockAcquired = true;

    operationResult = await operation();
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  } finally {
    if (lockAcquired) {
      try {
        const result = await lockClient.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock($1::bigint) AS released",
          [MIGRATION_BATCH_LOCK_KEY],
        );

        if (result.rows[0]?.released !== true) {
          throw new DatabaseMigrationError(
            "The database migration batch lock could not be released safely.",
          );
        }

        safeToReuseClient = true;
      } catch (error) {
        hasUnlockError = true;
        unlockError = error;
      }
    }

    lockClient.release(safeToReuseClient ? undefined : true);
  }

  if (hasPrimaryError && hasUnlockError) {
    throw new AggregateError(
      [primaryError, unlockError],
      "Database migration batch and lock cleanup both failed.",
    );
  }

  if (hasPrimaryError) {
    throw primaryError;
  }

  if (hasUnlockError) {
    throw unlockError;
  }

  return operationResult as T;
}

function quoteSchema(schema: string): string {
  if (!SAFE_POSTGRES_SCHEMA_PATTERN.test(schema)) {
    throw new DatabaseMigrationError(
      "The database migration schema must be a safe lowercase PostgreSQL identifier.",
    );
  }

  return `"${schema}"`;
}

function checksumSql(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function loadMigrations(directory: string): Promise<Migration[]> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new DatabaseMigrationError(
      `Unable to read the database migrations directory at "${directory}": ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (fileNames.length === 0) {
    throw new DatabaseMigrationError(
      `No database migrations were found at "${directory}".`,
    );
  }

  for (const [index, fileName] of fileNames.entries()) {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);

    if (!match) {
      throw new DatabaseMigrationError(
        `Migration file "${fileName}" must use the format 0001_description.sql.`,
      );
    }

    const expectedOrdinal = index + 1;
    const actualOrdinal = Number(match[1]);

    if (actualOrdinal !== expectedOrdinal) {
      throw new DatabaseMigrationError(
        `Migration file "${fileName}" has ordinal ${actualOrdinal}; expected ${expectedOrdinal}. Migration ordinals must be unique and contiguous.`,
      );
    }
  }

  return Promise.all(
    fileNames.map(async (fileName) => {
      const sql = await readFile(path.join(directory, fileName), "utf8");

      if (sql.trim().length === 0) {
        throw new DatabaseMigrationError(
          `Migration file "${fileName}" is empty.`,
        );
      }

      return {
        id: fileName,
        checksum: checksumSql(sql),
        sql,
      };
    }),
  );
}

function validateAppliedMigrations(
  migrations: Migration[],
  appliedMigrations: AppliedMigrationRow[],
): void {
  if (appliedMigrations.length > migrations.length) {
    throw new DatabaseMigrationError(
      "The database contains migrations that are not present in this application build.",
    );
  }

  for (const [index, appliedMigration] of appliedMigrations.entries()) {
    const expectedMigration = migrations[index];

    if (expectedMigration.id !== appliedMigration.migration_id) {
      throw new DatabaseMigrationError(
        `Applied migration history is out of order at "${appliedMigration.migration_id}"; expected "${expectedMigration.id}".`,
      );
    }

    if (expectedMigration.checksum !== appliedMigration.checksum) {
      throw new DatabaseMigrationError(
        `Checksum mismatch for applied migration "${appliedMigration.migration_id}". Applied migrations must not be edited.`,
      );
    }
  }
}

async function applyMigration(
  client: PoolClient,
  migration: Migration,
  quotedSchema: string,
): Promise<void> {
  await client.query("BEGIN");

  try {
    await client.query(`SET LOCAL search_path TO ${quotedSchema}`);
    await client.query(migration.sql);
    await client.query(
      `
        INSERT INTO ${quotedSchema}.app_schema_migrations (
          migration_id,
          checksum
        )
        VALUES ($1, $2)
      `,
      [migration.id, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Migration "${migration.id}" and transaction cleanup both failed.`,
      );
    }

    throw error;
  }
}

export async function runDatabaseMigrations(
  pool: Pool,
  options: DatabaseMigrationOptions = {},
): Promise<void> {
  const migrationsDirectory =
    options.migrationsDirectory ??
    path.join(process.cwd(), "database", "migrations");
  const migrations = await loadMigrations(migrationsDirectory);
  const quotedSchema = quoteSchema(
    options.schema ?? DEFAULT_POSTGRES_SCHEMA,
  );
  const client = await pool.connect();
  let lockAcquired = false;
  let safeToReuseClient = true;
  let primaryError: unknown;
  let hasPrimaryError = false;
  let unlockError: unknown;
  let hasUnlockError = false;

  try {
    safeToReuseClient = false;
    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      MIGRATION_LOCK_KEY,
    ]);
    lockAcquired = true;

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${quotedSchema}.app_schema_migrations (
        migration_id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query<AppliedMigrationRow>(`
      SELECT migration_id, checksum
      FROM ${quotedSchema}.app_schema_migrations
      ORDER BY migration_id ASC
    `);

    validateAppliedMigrations(migrations, appliedResult.rows);

    for (const migration of migrations.slice(appliedResult.rows.length)) {
      await applyMigration(client, migration, quotedSchema);
    }
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  } finally {
    if (lockAcquired) {
      try {
        const result = await client.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock($1::bigint) AS released",
          [MIGRATION_LOCK_KEY],
        );

        if (result.rows[0]?.released !== true) {
          throw new DatabaseMigrationError(
            "The database migration lock could not be released safely.",
          );
        }

        safeToReuseClient = true;
      } catch (error) {
        hasUnlockError = true;
        unlockError = error;
      }
    }

    client.release(
      !safeToReuseClient || primaryError instanceof AggregateError
        ? true
        : undefined,
    );
  }

  if (hasPrimaryError && hasUnlockError) {
    throw new AggregateError(
      [primaryError, unlockError],
      "Database migration and lock cleanup both failed.",
    );
  }

  if (hasPrimaryError) {
    throw primaryError;
  }

  if (hasUnlockError) {
    throw unlockError;
  }
}
