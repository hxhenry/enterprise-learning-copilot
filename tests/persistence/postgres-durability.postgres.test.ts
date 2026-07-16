import { randomUUID } from "node:crypto";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  Command,
  INTERRUPT,
  isInterrupted,
} from "@langchain/langgraph";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createLearningGraph } from "@/lib/agents/graph";
import {
  PostgresWorkflowExecutionCoordinator,
} from "@/lib/concurrency/workflow-execution-coordinator";
import { runDatabaseMigrations } from "@/lib/database/migrations";
import { EnrollmentActionConflictError } from "@/lib/database/errors";
import { checkPostgresReadiness } from "@/lib/database/postgres";
import type { Course } from "@/lib/domain/learning";
import type { CreateEnrollmentInput } from "@/lib/domain/enrollment";
import { inMemoryLearningGraphRepositories } from "@/lib/repositories/in-memory-repositories";
import { PostgresEnrollmentRepository } from "@/lib/repositories/postgres-enrollment-repository";
import type { AgentEventPayload } from "@/lib/schemas/events";
import { getAuthenticatedActor } from "@/lib/security/authorization";
import {
  createCheckpointThreadId,
  createWorkflowLockKey,
} from "@/lib/security/checkpoint-thread";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for PostgreSQL persistence tests.",
  );
}

const testDatabaseEngine =
  process.env.TEST_DATABASE_ENGINE?.trim() || "postgres";

if (testDatabaseEngine !== "postgres" && testDatabaseEngine !== "pglite") {
  throw new Error(
    "TEST_DATABASE_ENGINE must be either postgres or pglite.",
  );
}

const EXPECTED_RELATIONS = [
  "app_schema_migrations",
  "checkpoint_blobs",
  "checkpoint_migrations",
  "checkpoint_writes",
  "checkpoints",
  "course_enrollments",
  "enrollment_action_claims",
] as const;

const enrollmentInput: CreateEnrollmentInput = {
  actionId: "action-create-replay",
  userId: "user-001",
  courseId: "course-network-301",
  courseTitle: "Secure Cloud Networking",
  approvedBy: "user-001",
};

const actor = getAuthenticatedActor();
const testCourse: Course = {
  id: enrollmentInput.courseId,
  title: enrollmentInput.courseTitle,
  topic: "Network Security",
  level: "intermediate",
  durationHours: 5,
};

let schemaSequence = 0;

function createSchemaName(label: string): string {
  schemaSequence += 1;

  const safeLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  const nonce = randomUUID().replaceAll("-", "").slice(0, 10);

  return `v03_${safeLabel}_${process.pid}_${schemaSequence}_${nonce}`.slice(
    0,
    63,
  );
}

type PersistenceFixture = {
  schema: string;
  initialPool: Pool;
  initialCheckpointer: PostgresSaver;
  createPool: () => Pool;
  createCheckpointer: (pool: Pool) => Promise<PostgresSaver>;
  closePool: (pool: Pool) => Promise<void>;
  dispose: () => Promise<void>;
};

function createTestPool(): Pool {
  return new Pool({
    connectionString: testDatabaseUrl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    max: 4,
  });
}

async function createPersistenceFixture(
  label: string,
): Promise<PersistenceFixture> {
  const schema = createSchemaName(label);
  const pools = new Set<Pool>();

  const createPool = () => {
    const pool = createTestPool();
    pools.add(pool);
    return pool;
  };

  const closePool = async (pool: Pool) => {
    if (!pools.delete(pool)) {
      return;
    }

    await pool.end();
  };

  const createCheckpointer = async (pool: Pool) => {
    const checkpointer = new PostgresSaver(pool, undefined, { schema });
    await checkpointer.setup();
    return checkpointer;
  };

  const dispose = async () => {
    const cleanupErrors: unknown[] = [];

    for (const pool of [...pools]) {
      try {
        await closePool(pool);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    const cleanupPool = createTestPool();

    try {
      await cleanupPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      await cleanupPool.end();
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        `Unable to clean PostgreSQL test schema ${schema}.`,
      );
    }
  };

  const initialPool = createPool();

  try {
    await runDatabaseMigrations(initialPool, { schema });
    const initialCheckpointer = await createCheckpointer(initialPool);
    await checkPostgresReadiness(initialPool, schema);

    return {
      schema,
      initialPool,
      initialCheckpointer,
      createPool,
      createCheckpointer,
      closePool,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function withFixture(
  label: string,
  test: (fixture: PersistenceFixture) => Promise<void>,
): Promise<void> {
  const fixture = await createPersistenceFixture(label);

  try {
    await test(fixture);
  } finally {
    await fixture.dispose();
  }
}

async function tableCounts(pool: Pool, schema: string) {
  const result = await pool.query<{
    action_claims: number;
    enrollments: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM "${schema}".enrollment_action_claims)
        AS action_claims,
      (SELECT COUNT(*)::int FROM "${schema}".course_enrollments)
        AS enrollments
  `);

  return result.rows[0];
}

function createDeferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });

  return { promise, resolve };
}

function createInitialState(message: string) {
  return {
    userMessage: message,
    conversation: [
      {
        role: "user" as const,
        content: message,
      },
    ],
    selectedAgent: null,
    routingReason: "",
    requestKind: "answer" as const,
    pendingEnrollment: null,
    resolvedEnrollmentActionId: null,
    approvalStatus: "not-required" as const,
    finalAnswer: "",
  };
}

function createGraphConfig(checkpointThreadId: string) {
  return {
    configurable: {
      thread_id: checkpointThreadId,
    },
    recursionLimit: 12,
  };
}

function createEnrollmentGraph({
  actionId,
  checkpointer,
  clientThreadId,
  events,
  pool,
  schema,
}: {
  actionId: string;
  checkpointer: PostgresSaver;
  clientThreadId: string;
  events?: AgentEventPayload[];
  pool: Pool;
  schema: string;
}) {
  return createLearningGraph({
    actor,
    abortSignal: new AbortController().signal,
    reportEvent: (event) => events?.push(event),
    runContext: {
      requestId: `request-${actionId}`,
      agentRunId: `run-${actionId}`,
      threadId: clientThreadId,
      operation: "chat",
    },
    dependencies: {
      checkpointer,
      repositories: {
        ...inMemoryLearningGraphRepositories,
        enrollment: new PostgresEnrollmentRepository(pool, schema),
      },
      routeRequest: async () => ({
        agentId: "certification",
        requestKind: "enrollment",
        reason: "The integration test requested enrollment.",
      }),
      resolveCourse: async () => testCourse,
      createActionId: () => actionId,
      now: () => new Date("2026-07-15T20:00:00.000Z"),
    },
  });
}

async function interruptEnrollment({
  actionId,
  checkpointer,
  clientThreadId,
  pool,
  schema,
}: {
  actionId: string;
  checkpointer: PostgresSaver;
  clientThreadId: string;
  pool: Pool;
  schema: string;
}) {
  const checkpointThreadId = createCheckpointThreadId(
    actor.userId,
    clientThreadId,
  );
  const graph = createEnrollmentGraph({
    actionId,
    checkpointer,
    clientThreadId,
    pool,
    schema,
  });
  const interrupted = await graph.invoke(
    createInitialState(`Enroll me in ${testCourse.title}`),
    createGraphConfig(checkpointThreadId),
  );

  expect(isInterrupted(interrupted)).toBe(true);

  if (!isInterrupted(interrupted)) {
    throw new Error("Expected the PostgreSQL-backed graph to interrupt.");
  }

  expect(interrupted[INTERRUPT][0]?.value).toMatchObject({
    actionId,
    userId: actor.userId,
    courseId: testCourse.id,
    courseTitle: testCourse.title,
  });

  return checkpointThreadId;
}

describe("PostgreSQL persistence", () => {
  it("applies app and checkpoint migrations repeatably", async () => {
    await withFixture("migrations", async (fixture) => {
      const beforeAppMigrations = await fixture.initialPool.query<{
        migration_id: string;
        checksum: string;
      }>(`
        SELECT migration_id, checksum
        FROM "${fixture.schema}".app_schema_migrations
        ORDER BY migration_id
      `);
      const beforeCheckpointMigrations = await fixture.initialPool.query<{
        v: number;
      }>(`
        SELECT v
        FROM "${fixture.schema}".checkpoint_migrations
        ORDER BY v
      `);

      await runDatabaseMigrations(fixture.initialPool, {
        schema: fixture.schema,
      });
      await fixture.initialCheckpointer.setup();

      const afterAppMigrations = await fixture.initialPool.query<{
        migration_id: string;
        checksum: string;
      }>(`
        SELECT migration_id, checksum
        FROM "${fixture.schema}".app_schema_migrations
        ORDER BY migration_id
      `);
      const afterCheckpointMigrations = await fixture.initialPool.query<{
        v: number;
      }>(`
        SELECT v
        FROM "${fixture.schema}".checkpoint_migrations
        ORDER BY v
      `);
      const relations = await fixture.initialPool.query<{
        table_name: string;
      }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
          ORDER BY table_name
        `,
        [fixture.schema],
      );

      expect(beforeAppMigrations.rows.length).toBeGreaterThan(0);
      expect(beforeCheckpointMigrations.rows.length).toBeGreaterThan(0);
      expect(afterAppMigrations.rows).toEqual(beforeAppMigrations.rows);
      expect(afterCheckpointMigrations.rows).toEqual(
        beforeCheckpointMigrations.rows,
      );
      expect(relations.rows.map((row) => row.table_name)).toEqual(
        EXPECTED_RELATIONS,
      );
    });
  });

  it("creates an enrollment and replays the same action without another row", async () => {
    await withFixture("repository_replay", async (fixture) => {
      const repository = new PostgresEnrollmentRepository(
        fixture.initialPool,
        fixture.schema,
      );

      const created = await repository.createCourseEnrollment(enrollmentInput);
      const replayed = await repository.createCourseEnrollment(enrollmentInput);

      expect(created).toMatchObject({
        created: true,
        record: {
          actionId: enrollmentInput.actionId,
          userId: enrollmentInput.userId,
          courseId: enrollmentInput.courseId,
          status: "enrolled",
        },
      });
      expect(replayed).toEqual({
        created: false,
        record: created.record,
      });
      await expect(
        tableCounts(fixture.initialPool, fixture.schema),
      ).resolves.toEqual({
        action_claims: 1,
        enrollments: 1,
      });
    });
  });

  it("rejects reuse of an action ID with a conflicting payload", async () => {
    await withFixture("action_conflict", async (fixture) => {
      const repository = new PostgresEnrollmentRepository(
        fixture.initialPool,
        fixture.schema,
      );

      await repository.createCourseEnrollment(enrollmentInput);

      await expect(
        repository.createCourseEnrollment({
          ...enrollmentInput,
          courseTitle: "A Different Course Payload",
        }),
      ).rejects.toBeInstanceOf(EnrollmentActionConflictError);
      await expect(
        tableCounts(fixture.initialPool, fixture.schema),
      ).resolves.toEqual({
        action_claims: 1,
        enrollments: 1,
      });
    });
  });

  it("claims a second action even when its user-course enrollment already exists", async () => {
    await withFixture("duplicate_course", async (fixture) => {
      const repository = new PostgresEnrollmentRepository(
        fixture.initialPool,
        fixture.schema,
      );
      const first = await repository.createCourseEnrollment(enrollmentInput);
      const duplicateActionId = "action-duplicate-user-course";
      const duplicate = await repository.createCourseEnrollment({
        ...enrollmentInput,
        actionId: duplicateActionId,
      });
      const claims = await fixture.initialPool.query<{ action_id: string }>(`
        SELECT action_id
        FROM "${fixture.schema}".enrollment_action_claims
        ORDER BY action_id
      `);

      expect(first.created).toBe(true);
      expect(duplicate).toEqual({
        created: false,
        record: first.record,
      });
      expect(claims.rows.map((row) => row.action_id)).toEqual([
        enrollmentInput.actionId,
        duplicateActionId,
      ]);
      await expect(
        tableCounts(fixture.initialPool, fixture.schema),
      ).resolves.toEqual({
        action_claims: 2,
        enrollments: 1,
      });
    });
  });

  it("resumes a durable interrupt on a new pool and replays approval exactly once", async () => {
    await withFixture("durable_approval", async (fixture) => {
      const actionId = "action-durable-approval";
      const clientThreadId = "thread-durable-approval";
      const checkpointThreadId = await interruptEnrollment({
        actionId,
        checkpointer: fixture.initialCheckpointer,
        clientThreadId,
        pool: fixture.initialPool,
        schema: fixture.schema,
      });

      await fixture.closePool(fixture.initialPool);

      const resumePool = fixture.createPool();
      const resumeCheckpointer = await fixture.createCheckpointer(resumePool);
      const resumeEvents: AgentEventPayload[] = [];
      const resumedGraph = createEnrollmentGraph({
        actionId,
        checkpointer: resumeCheckpointer,
        clientThreadId,
        events: resumeEvents,
        pool: resumePool,
        schema: fixture.schema,
      });
      const approved = await resumedGraph.invoke(
        new Command({
          resume: {
            actionId,
            approved: true,
            decidedBy: actor.userId,
          },
        }),
        createGraphConfig(checkpointThreadId),
      );

      expect(isInterrupted(approved)).toBe(false);
      expect(approved).toMatchObject({
        approvalStatus: "approved",
        pendingEnrollment: null,
        resolvedEnrollmentActionId: actionId,
      });
      expect(approved.finalAnswer).toContain("Enrollment approved");
      expect(
        resumeEvents.filter((event) => event.type === "approval-resolved"),
      ).toHaveLength(1);
      await expect(tableCounts(resumePool, fixture.schema)).resolves.toEqual({
        action_claims: 1,
        enrollments: 1,
      });

      await fixture.closePool(resumePool);

      const replayPool = fixture.createPool();
      const replayCheckpointer = await fixture.createCheckpointer(replayPool);
      const replayEvents: AgentEventPayload[] = [];
      const replayedGraph = createEnrollmentGraph({
        actionId,
        checkpointer: replayCheckpointer,
        clientThreadId,
        events: replayEvents,
        pool: replayPool,
        schema: fixture.schema,
      });
      const replayed = await replayedGraph.invoke(
        new Command({
          resume: {
            actionId,
            approved: true,
            decidedBy: actor.userId,
          },
        }),
        createGraphConfig(checkpointThreadId),
      );

      expect(replayed).toMatchObject({
        approvalStatus: "approved",
        pendingEnrollment: null,
        resolvedEnrollmentActionId: actionId,
      });
      expect(replayed.finalAnswer).toBe(approved.finalAnswer);
      expect(
        replayEvents.filter((event) => event.type === "tool-start"),
      ).toHaveLength(0);
      await expect(tableCounts(replayPool, fixture.schema)).resolves.toEqual({
        action_claims: 1,
        enrollments: 1,
      });
    });
  });

  it("persists a rejection on a new pool without creating business rows", async () => {
    await withFixture("durable_rejection", async (fixture) => {
      const actionId = "action-durable-rejection";
      const clientThreadId = "thread-durable-rejection";
      const checkpointThreadId = await interruptEnrollment({
        actionId,
        checkpointer: fixture.initialCheckpointer,
        clientThreadId,
        pool: fixture.initialPool,
        schema: fixture.schema,
      });

      await fixture.closePool(fixture.initialPool);

      const resumePool = fixture.createPool();
      const resumeCheckpointer = await fixture.createCheckpointer(resumePool);
      const resumedGraph = createEnrollmentGraph({
        actionId,
        checkpointer: resumeCheckpointer,
        clientThreadId,
        pool: resumePool,
        schema: fixture.schema,
      });
      const rejected = await resumedGraph.invoke(
        new Command({
          resume: {
            actionId,
            approved: false,
            decidedBy: actor.userId,
          },
        }),
        createGraphConfig(checkpointThreadId),
      );

      expect(isInterrupted(rejected)).toBe(false);
      expect(rejected).toMatchObject({
        approvalStatus: "rejected",
        pendingEnrollment: null,
        resolvedEnrollmentActionId: actionId,
      });
      expect(rejected.finalAnswer).toContain("No records were changed");
      await expect(tableCounts(resumePool, fixture.schema)).resolves.toEqual({
        action_claims: 0,
        enrollments: 0,
      });
    });
  });

  if (testDatabaseEngine === "postgres") {
    it(
      "serializes conflicting decisions across coordinators and preserves the first terminal result",
      async () => {
        await withFixture("coordinator_race", async (fixture) => {
          const actionId = "action-coordinator-race";
          const clientThreadId = "thread-coordinator-race";
          const checkpointThreadId = await interruptEnrollment({
            actionId,
            checkpointer: fixture.initialCheckpointer,
            clientThreadId,
            pool: fixture.initialPool,
            schema: fixture.schema,
          });

          await fixture.closePool(fixture.initialPool);

          const firstPool = fixture.createPool();
          const secondPool = fixture.createPool();
          const firstCheckpointer = await fixture.createCheckpointer(firstPool);
          const secondCheckpointer =
            await fixture.createCheckpointer(secondPool);
          const firstCoordinator = new PostgresWorkflowExecutionCoordinator(
            firstPool,
            { lockTimeoutMs: 5_000, pollIntervalMs: 5 },
          );
          const secondCoordinator = new PostgresWorkflowExecutionCoordinator(
            secondPool,
            { lockTimeoutMs: 5_000, pollIntervalMs: 5 },
          );
          const firstStarted = createDeferred();
          const releaseFirst = createDeferred();
          const secondStarted = createDeferred();
          const order: string[] = [];
          const workflowKey = createWorkflowLockKey(checkpointThreadId);

          const firstDecision = firstCoordinator.run(
            workflowKey,
            async () => {
              order.push("first-start");
              firstStarted.resolve();
              await releaseFirst.promise;

              const result = await createEnrollmentGraph({
                actionId,
                checkpointer: firstCheckpointer,
                clientThreadId,
                pool: firstPool,
                schema: fixture.schema,
              }).invoke(
                new Command({
                  resume: {
                    actionId,
                    approved: true,
                    decidedBy: actor.userId,
                  },
                }),
                createGraphConfig(checkpointThreadId),
              );

              order.push("first-end");
              return result;
            },
          );

          await firstStarted.promise;

          const secondDecision = secondCoordinator.run(
            workflowKey,
            async () => {
              order.push("second-start");
              secondStarted.resolve();

              const result = await createEnrollmentGraph({
                actionId,
                checkpointer: secondCheckpointer,
                clientThreadId,
                pool: secondPool,
                schema: fixture.schema,
              }).invoke(
                new Command({
                  resume: {
                    actionId,
                    approved: false,
                    decidedBy: actor.userId,
                  },
                }),
                createGraphConfig(checkpointThreadId),
              );

              order.push("second-end");
              return result;
            },
          );

          try {
            const secondRanWhileLocked = await Promise.race([
              secondStarted.promise.then(() => true),
              new Promise<false>((resolve) => {
                setTimeout(() => resolve(false), 50);
              }),
            ]);

            expect(secondRanWhileLocked).toBe(false);
            expect(order).toEqual(["first-start"]);
          } finally {
            releaseFirst.resolve();
          }

          const [firstResult, secondResult] = await Promise.all([
            firstDecision,
            secondDecision,
          ]);

          expect(order).toEqual([
            "first-start",
            "first-end",
            "second-start",
            "second-end",
          ]);
          expect(firstResult).toMatchObject({
            approvalStatus: "approved",
            resolvedEnrollmentActionId: actionId,
          });
          expect(secondResult).toMatchObject({
            approvalStatus: "approved",
            resolvedEnrollmentActionId: actionId,
          });
          expect(secondResult.finalAnswer).toBe(firstResult.finalAnswer);
          await expect(
            tableCounts(secondPool, fixture.schema),
          ).resolves.toEqual({
            action_claims: 1,
            enrollments: 1,
          });
        });
      },
      15_000,
    );
  } else {
    it("records the local PGlite socket's single-session lock limitation", async () => {
      await withFixture("pglite_session", async (fixture) => {
        const secondPool = fixture.createPool();
        const [firstBackend, secondBackend] = await Promise.all([
          fixture.initialPool.query<{ backend_pid: number }>(
            "SELECT pg_backend_pid()::int AS backend_pid",
          ),
          secondPool.query<{ backend_pid: number }>(
            "SELECT pg_backend_pid()::int AS backend_pid",
          ),
        ]);

        expect(firstBackend.rows[0]?.backend_pid).toBe(
          secondBackend.rows[0]?.backend_pid,
        );
      });
    });
  }
});
