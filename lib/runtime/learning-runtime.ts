import {
  MemorySaver,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";

import {
  InMemoryWorkflowExecutionCoordinator,
  PostgresWorkflowExecutionCoordinator,
  type WorkflowExecutionCoordinator,
} from "@/lib/concurrency/workflow-execution-coordinator";
import {
  getServerEnvironment,
  type PersistenceBackend,
  type ServerEnvironment,
} from "@/lib/config/server-environment";
import {
  checkPostgresReadiness,
  getSharedPostgresPool,
  getSharedPostgresWorkflowLockPool,
  PostgresReadinessError,
} from "@/lib/database/postgres";
import { PersistenceAwarePostgresSaver } from "@/lib/database/persistence-aware-postgres-saver";
import { asPersistenceOperationError } from "@/lib/database/errors";
import type { LearningGraphRepositories } from "@/lib/repositories/contracts";
import { inMemoryLearningGraphRepositories } from "@/lib/repositories/in-memory-repositories";
import { PostgresEnrollmentRepository } from "@/lib/repositories/postgres-enrollment-repository";

export type LearningRuntime = {
  backend: PersistenceBackend;
  checkpointer: BaseCheckpointSaver;
  repositories: LearningGraphRepositories;
  workflowCoordinator: WorkflowExecutionCoordinator;
  checkReadiness: () => Promise<void>;
};

const globalForLearningRuntime = globalThis as typeof globalThis & {
  learningCopilotRuntimePromise?: Promise<LearningRuntime>;
  learningCopilotMemoryCheckpointer?: MemorySaver;
};

const memoryCheckpointer =
  globalForLearningRuntime.learningCopilotMemoryCheckpointer ??
  new MemorySaver();

globalForLearningRuntime.learningCopilotMemoryCheckpointer =
  memoryCheckpointer;

async function checkDurableReadiness(
  pool: Parameters<typeof checkPostgresReadiness>[0],
  schema: string,
): Promise<void> {
  try {
    await checkPostgresReadiness(pool, schema);
  } catch (error) {
    if (error instanceof PostgresReadinessError) {
      throw error;
    }

    throw asPersistenceOperationError(error);
  }
}

export function createLearningRuntime(
  environment: ServerEnvironment,
): LearningRuntime {
  if (environment.PERSISTENCE_BACKEND === "memory") {
    return {
      backend: "memory",
      checkpointer: memoryCheckpointer,
      repositories: inMemoryLearningGraphRepositories,
      workflowCoordinator: new InMemoryWorkflowExecutionCoordinator(),
      async checkReadiness() {
        // The in-process bundle has no external dependency to probe.
      },
    };
  }

  const pool = getSharedPostgresPool(environment);
  const workflowLockPool =
    getSharedPostgresWorkflowLockPool(environment);
  const checkpointer = new PersistenceAwarePostgresSaver(pool, undefined, {
    schema: environment.POSTGRES_SCHEMA,
  });

  return {
    backend: "postgres",
    checkpointer,
    repositories: {
      ...inMemoryLearningGraphRepositories,
      enrollment: new PostgresEnrollmentRepository(
        pool,
        environment.POSTGRES_SCHEMA,
      ),
    },
    workflowCoordinator: new PostgresWorkflowExecutionCoordinator(
      workflowLockPool,
      {
        lockTimeoutMs: environment.POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS,
      },
    ),
    checkReadiness: () =>
      checkDurableReadiness(pool, environment.POSTGRES_SCHEMA),
  };
}

async function createReadyLearningRuntime(): Promise<LearningRuntime> {
  const runtime = createLearningRuntime(getServerEnvironment());

  await runtime.checkReadiness();

  return runtime;
}

export function getLearningRuntime(): Promise<LearningRuntime> {
  const existingRuntime =
    globalForLearningRuntime.learningCopilotRuntimePromise;

  if (existingRuntime) {
    return existingRuntime;
  }

  const runtimePromise = createReadyLearningRuntime().catch((error) => {
    if (
      globalForLearningRuntime.learningCopilotRuntimePromise === runtimePromise
    ) {
      delete globalForLearningRuntime.learningCopilotRuntimePromise;
    }

    throw error;
  });

  globalForLearningRuntime.learningCopilotRuntimePromise = runtimePromise;

  return runtimePromise;
}

export function initializeLearningRuntime(): Promise<LearningRuntime> {
  return getLearningRuntime();
}
