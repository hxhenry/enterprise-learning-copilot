// @vitest-environment node

import { MemorySaver } from "@langchain/langgraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pool: {
    connect: vi.fn(),
    query: vi.fn(),
  },
  workflowLockPool: {
    connect: vi.fn(),
    query: vi.fn(),
  },
  getSharedPostgresPool: vi.fn(),
  getSharedPostgresWorkflowLockPool: vi.fn(),
  checkPostgresReadiness: vi.fn(),
}));

vi.mock("@/lib/database/postgres", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/database/postgres")
  >()),
  getSharedPostgresPool: mocks.getSharedPostgresPool,
  getSharedPostgresWorkflowLockPool:
    mocks.getSharedPostgresWorkflowLockPool,
  checkPostgresReadiness: mocks.checkPostgresReadiness,
}));

import {
  InMemoryWorkflowExecutionCoordinator,
  PostgresWorkflowExecutionCoordinator,
} from "@/lib/concurrency/workflow-execution-coordinator";
import { parseServerEnvironment } from "@/lib/config/server-environment";
import { PostgresReadinessError } from "@/lib/database/postgres";
import { PersistenceOperationError } from "@/lib/database/errors";
import { inMemoryLearningGraphRepositories } from "@/lib/repositories/in-memory-repositories";
import { PostgresEnrollmentRepository } from "@/lib/repositories/postgres-enrollment-repository";
import { PersistenceAwarePostgresSaver } from "@/lib/database/persistence-aware-postgres-saver";
import {
  createLearningRuntime,
  getLearningRuntime,
  initializeLearningRuntime,
} from "@/lib/runtime/learning-runtime";

const runtimeGlobal = globalThis as typeof globalThis & {
  learningCopilotRuntimePromise?: unknown;
};

describe("learning runtime composition", () => {
  beforeEach(() => {
    delete runtimeGlobal.learningCopilotRuntimePromise;
    mocks.getSharedPostgresPool.mockReset();
    mocks.getSharedPostgresPool.mockReturnValue(mocks.pool);
    mocks.getSharedPostgresWorkflowLockPool.mockReset();
    mocks.getSharedPostgresWorkflowLockPool.mockReturnValue(
      mocks.workflowLockPool,
    );
    mocks.checkPostgresReadiness.mockReset();
    mocks.checkPostgresReadiness.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete runtimeGlobal.learningCopilotRuntimePromise;
    vi.unstubAllEnvs();
  });

  it("builds a coherent in-memory bundle", async () => {
    const runtime = createLearningRuntime(
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
      }),
    );

    expect(runtime.backend).toBe("memory");
    expect(runtime.checkpointer).toBeInstanceOf(MemorySaver);
    expect(runtime.repositories).toBe(inMemoryLearningGraphRepositories);
    expect(runtime.workflowCoordinator).toBeInstanceOf(
      InMemoryWorkflowExecutionCoordinator,
    );
    await expect(runtime.checkReadiness()).resolves.toBeUndefined();
    expect(mocks.getSharedPostgresPool).not.toHaveBeenCalled();
    expect(
      mocks.getSharedPostgresWorkflowLockPool,
    ).not.toHaveBeenCalled();
  });

  it("builds a coherent PostgreSQL bundle without running migrations", async () => {
    const setup = vi.spyOn(
      PersistenceAwarePostgresSaver.prototype,
      "setup",
    );
    const environment = parseServerEnvironment({
      OPENAI_API_KEY: "test-key",
      PERSISTENCE_BACKEND: "postgres",
      DATABASE_URL: "postgresql://learning:secret@localhost/learning",
      POSTGRES_SCHEMA: "learning_runtime",
      POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS: "1200",
    });

    const runtime = createLearningRuntime(environment);

    expect(runtime.backend).toBe("postgres");
    expect(runtime.checkpointer).toBeInstanceOf(
      PersistenceAwarePostgresSaver,
    );
    expect(runtime.repositories.learning).toBe(
      inMemoryLearningGraphRepositories.learning,
    );
    expect(runtime.repositories.analytics).toBe(
      inMemoryLearningGraphRepositories.analytics,
    );
    expect(runtime.repositories.knowledge).toBe(
      inMemoryLearningGraphRepositories.knowledge,
    );
    expect(runtime.repositories.enrollment).toBeInstanceOf(
      PostgresEnrollmentRepository,
    );
    expect(runtime.workflowCoordinator).toBeInstanceOf(
      PostgresWorkflowExecutionCoordinator,
    );
    expect(mocks.getSharedPostgresPool).toHaveBeenCalledWith(
      environment,
    );
    expect(
      mocks.getSharedPostgresWorkflowLockPool,
    ).toHaveBeenCalledWith(environment);
    expect(setup).not.toHaveBeenCalled();

    await runtime.checkReadiness();

    expect(mocks.checkPostgresReadiness).toHaveBeenCalledWith(
      mocks.pool,
      "learning_runtime",
    );
  });

  it("checks readiness once and shares initialization across callers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("PERSISTENCE_BACKEND", "postgres");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://learning:secret@localhost/learning",
    );
    vi.stubEnv("POSTGRES_SCHEMA", "learning_runtime");

    const firstRuntime = getLearningRuntime();
    const secondRuntime = initializeLearningRuntime();

    expect(firstRuntime).toBe(secondRuntime);
    await expect(firstRuntime).resolves.toMatchObject({
      backend: "postgres",
    });
    expect(mocks.getSharedPostgresPool).toHaveBeenCalledTimes(1);
    expect(
      mocks.getSharedPostgresWorkflowLockPool,
    ).toHaveBeenCalledTimes(1);
    expect(mocks.checkPostgresReadiness).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed readiness check", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("PERSISTENCE_BACKEND", "postgres");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://learning:secret@localhost/learning",
    );
    mocks.checkPostgresReadiness
      .mockRejectedValueOnce(new PostgresReadinessError(["checkpoints"]))
      .mockResolvedValueOnce(undefined);

    await expect(getLearningRuntime()).rejects.toBeInstanceOf(
      PostgresReadinessError,
    );
    await expect(getLearningRuntime()).resolves.toMatchObject({
      backend: "postgres",
    });

    expect(mocks.checkPostgresReadiness).toHaveBeenCalledTimes(2);
  });

  it("marks readiness connectivity failures at the persistence boundary", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("PERSISTENCE_BACKEND", "postgres");
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://learning:secret@localhost/learning",
    );
    mocks.checkPostgresReadiness.mockRejectedValueOnce(
      Object.assign(new Error("database host unavailable"), {
        code: "ECONNREFUSED",
      }),
    );

    await expect(getLearningRuntime()).rejects.toMatchObject({
      name: "PersistenceOperationError",
      retryable: true,
    } satisfies Partial<PersistenceOperationError>);
  });
});
