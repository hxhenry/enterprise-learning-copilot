import { createHash } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import {
  getPersistenceEnvironment,
  type PersistenceEnvironment,
} from "@/lib/config/server-environment";

export const REQUIRED_POSTGRES_RELATIONS = [
  "app_schema_migrations",
  "course_enrollments",
  "enrollment_action_claims",
  "checkpoint_migrations",
  "checkpoints",
  "checkpoint_blobs",
  "checkpoint_writes",
] as const;

export const REQUIRED_APP_MIGRATIONS = [
  {
    id: "0001_course_enrollments.sql",
    checksum:
      "36dba08275cbfd57e58e10a3d5264ed2e8fee1c936b212878f659b873a57612d",
  },
] as const;

export const REQUIRED_CHECKPOINT_MIGRATIONS = [0, 1, 2, 3, 4] as const;

const SAFE_POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

type RequiredPostgresRelation =
  (typeof REQUIRED_POSTGRES_RELATIONS)[number];

type PostgresRelationRow = {
  table_name: RequiredPostgresRelation;
};

type AppMigrationRow = {
  migration_id: string;
  checksum: string;
};

type CheckpointMigrationRow = {
  v: number;
};

type SharedPostgresPool = {
  configurationKey: string;
  pool: Pool;
};

type PostgresPoolRole = "application" | "workflow-lock";

const globalForPostgres = globalThis as typeof globalThis & {
  learningCopilotPostgresPool?: SharedPostgresPool;
  learningCopilotWorkflowLockPool?: SharedPostgresPool;
};

export class PostgresConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresConfigurationError";
  }
}

export class PostgresReadinessError extends Error {
  readonly missingRelations: readonly RequiredPostgresRelation[];

  constructor(missingRelations: readonly RequiredPostgresRelation[]) {
    super(
      "The PostgreSQL schema is not ready. Run the database migration command before starting the application.",
    );
    this.name = "PostgresReadinessError";
    this.missingRelations = missingRelations;
  }
}

function requirePostgresEnvironment(
  environment: PersistenceEnvironment,
): asserts environment is PersistenceEnvironment & { DATABASE_URL: string } {
  if (
    environment.PERSISTENCE_BACKEND !== "postgres" ||
    !environment.DATABASE_URL
  ) {
    throw new PostgresConfigurationError(
      "PostgreSQL resources require PERSISTENCE_BACKEND=postgres and a valid DATABASE_URL.",
    );
  }
}

function quotePostgresSchema(schema: string): string {
  if (!SAFE_POSTGRES_SCHEMA_PATTERN.test(schema)) {
    throw new PostgresConfigurationError(
      "The PostgreSQL schema must be a safe lowercase identifier.",
    );
  }

  return `"${schema}"`;
}

function createPoolConfiguration(
  environment: PersistenceEnvironment & { DATABASE_URL: string },
  role: PostgresPoolRole,
): PoolConfig {
  return {
    connectionString: environment.DATABASE_URL,
    application_name:
      role === "application"
        ? "enterprise-learning-copilot"
        : "enterprise-learning-copilot-workflow-locks",
    max:
      role === "application"
        ? environment.POSTGRES_POOL_MAX
        : environment.POSTGRES_WORKFLOW_LOCK_POOL_MAX,
    connectionTimeoutMillis:
      environment.POSTGRES_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: environment.POSTGRES_IDLE_TIMEOUT_MS,
    statement_timeout: environment.POSTGRES_STATEMENT_TIMEOUT_MS,
    query_timeout: environment.POSTGRES_STATEMENT_TIMEOUT_MS,
    options: `-c search_path=${environment.POSTGRES_SCHEMA}`,
  };
}

function createConfigurationKey(
  environment: PersistenceEnvironment & { DATABASE_URL: string },
  role: PostgresPoolRole,
): string {
  const databaseUrlHash = createHash("sha256")
    .update(environment.DATABASE_URL, "utf8")
    .digest("hex");

  return JSON.stringify({
    role,
    databaseUrlHash,
    schema: environment.POSTGRES_SCHEMA,
    max: environment.POSTGRES_POOL_MAX,
    workflowLockMax: environment.POSTGRES_WORKFLOW_LOCK_POOL_MAX,
    connectionTimeoutMs: environment.POSTGRES_CONNECTION_TIMEOUT_MS,
    idleTimeoutMs: environment.POSTGRES_IDLE_TIMEOUT_MS,
    statementTimeoutMs: environment.POSTGRES_STATEMENT_TIMEOUT_MS,
  });
}

function createPostgresPoolForRole(
  environment: PersistenceEnvironment,
  role: PostgresPoolRole,
): Pool {
  requirePostgresEnvironment(environment);

  const pool = new Pool(createPoolConfiguration(environment, role));

  pool.on("error", () => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "postgres.idle-client.failed",
        errorMessage: "An idle PostgreSQL client failed.",
      }),
    );
  });

  return pool;
}

export function createPostgresPool(
  environment: PersistenceEnvironment,
): Pool {
  return createPostgresPoolForRole(environment, "application");
}

export function createPostgresWorkflowLockPool(
  environment: PersistenceEnvironment,
): Pool {
  return createPostgresPoolForRole(environment, "workflow-lock");
}

function getSharedPool(
  environment: PersistenceEnvironment,
  role: PostgresPoolRole,
): Pool {
  requirePostgresEnvironment(environment);

  const configurationKey = createConfigurationKey(environment, role);
  const property =
    role === "application"
      ? "learningCopilotPostgresPool"
      : "learningCopilotWorkflowLockPool";
  const existingPool = globalForPostgres[property];

  if (existingPool && !existingPool.pool.ended) {
    if (existingPool.configurationKey !== configurationKey) {
      throw new PostgresConfigurationError(
        "The shared PostgreSQL pool was already initialized with different settings.",
      );
    }

    return existingPool.pool;
  }

  const pool = createPostgresPoolForRole(environment, role);

  globalForPostgres[property] = {
    configurationKey,
    pool,
  };

  return pool;
}

export function getSharedPostgresPool(
  environment: PersistenceEnvironment = getPersistenceEnvironment(),
): Pool {
  return getSharedPool(environment, "application");
}

export function getSharedPostgresWorkflowLockPool(
  environment: PersistenceEnvironment = getPersistenceEnvironment(),
): Pool {
  return getSharedPool(environment, "workflow-lock");
}

export async function checkPostgresReadiness(
  pool: Pool,
  schema: string,
): Promise<void> {
  const quotedSchema = quotePostgresSchema(schema);
  const result = await pool.query<PostgresRelationRow>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = ANY($2::text[])
    `,
    [schema, [...REQUIRED_POSTGRES_RELATIONS]],
  );
  const availableRelations = new Set(
    result.rows.map((row) => row.table_name),
  );
  const missingRelations = REQUIRED_POSTGRES_RELATIONS.filter(
    (relation) => !availableRelations.has(relation),
  );

  if (missingRelations.length > 0) {
    throw new PostgresReadinessError(missingRelations);
  }

  const [appMigrations, checkpointMigrations] = await Promise.all([
    pool.query<AppMigrationRow>(
      `
        SELECT migration_id, checksum
        FROM ${quotedSchema}.app_schema_migrations
        ORDER BY migration_id ASC
      `,
    ),
    pool.query<CheckpointMigrationRow>(
      `
        SELECT v
        FROM ${quotedSchema}.checkpoint_migrations
        ORDER BY v ASC
      `,
    ),
  ]);
  const appMigrationHistoryReady =
    appMigrations.rows.length === REQUIRED_APP_MIGRATIONS.length &&
    REQUIRED_APP_MIGRATIONS.every((expected, index) => {
      const actual = appMigrations.rows[index];

      return (
        actual?.migration_id === expected.id &&
        actual.checksum === expected.checksum
      );
    });
  const checkpointMigrationHistoryReady =
    checkpointMigrations.rows.length ===
      REQUIRED_CHECKPOINT_MIGRATIONS.length &&
    REQUIRED_CHECKPOINT_MIGRATIONS.every(
      (expected, index) =>
        checkpointMigrations.rows[index]?.v === expected,
    );

  if (!appMigrationHistoryReady || !checkpointMigrationHistoryReady) {
    throw new PostgresReadinessError([]);
  }
}
