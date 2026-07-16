import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import {
  getPersistenceEnvironment,
  ServerEnvironmentError,
} from "@/lib/config/server-environment";
import { DatabaseMigrationError } from "@/lib/database/errors";
import {
  runDatabaseMigrationBatch,
  runDatabaseMigrations,
} from "@/lib/database/migrations";
import {
  checkPostgresReadiness,
  createPostgresPool,
} from "@/lib/database/postgres";

async function main(): Promise<void> {
  const environment = getPersistenceEnvironment();

  if (environment.PERSISTENCE_BACKEND !== "postgres") {
    throw new ServerEnvironmentError([
      "PERSISTENCE_BACKEND must be postgres for database migrations.",
    ]);
  }

  const pool = createPostgresPool(environment);

  try {
    await runDatabaseMigrationBatch(pool, async () => {
      await runDatabaseMigrations(pool, {
        schema: environment.POSTGRES_SCHEMA,
      });

      const checkpointer = new PostgresSaver(pool, undefined, {
        schema: environment.POSTGRES_SCHEMA,
      });

      await checkpointer.setup();
      await checkPostgresReadiness(pool, environment.POSTGRES_SCHEMA);
    });

    console.info(
      `Database migrations completed for schema "${environment.POSTGRES_SCHEMA}".`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const publicMessage =
    error instanceof ServerEnvironmentError ||
    error instanceof DatabaseMigrationError
      ? error.message
      : `Database migration failed (${error instanceof Error ? error.name : "UnknownError"}).`;

  console.error(publicMessage);
  process.exitCode = 1;
});
