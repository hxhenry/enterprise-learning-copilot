// @vitest-environment node

import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  EnrollmentActionConflictError,
  PersistenceOperationError,
} from "@/lib/database/errors";
import type { CreateEnrollmentInput } from "@/lib/domain/enrollment";
import { PostgresEnrollmentRepository } from "@/lib/repositories/postgres-enrollment-repository";

const input: CreateEnrollmentInput = {
  actionId: "action-123",
  userId: "user-001",
  courseId: "course-301",
  courseTitle: "Secure Cloud Networking",
  approvedBy: "user-001",
};

const enrollmentRow = {
  action_id: input.actionId,
  user_id: input.userId,
  course_id: input.courseId,
  course_title: input.courseTitle,
  status: "enrolled" as const,
  approved_by: input.approvedBy,
  approved_at: new Date("2026-07-15T20:05:00.000Z"),
};

const actionClaimRow = {
  action_id: input.actionId,
  user_id: input.userId,
  course_id: input.courseId,
  course_title: input.courseTitle,
  approved_by: input.approvedBy,
};

function result<Row extends Record<string, unknown>>(
  rows: Row[],
): QueryResult<Row> {
  return { rows } as QueryResult<Row>;
}

function createPool(
  handler: (sql: string, values?: unknown[]) => Promise<QueryResult<never>>,
) {
  const release = vi.fn();
  const query = vi.fn(handler);
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(),
  } as unknown as Pool;

  return { pool, query, release };
}

describe("PostgresEnrollmentRepository", () => {
  it("claims an action and creates an enrollment in one transaction", async () => {
    const { pool, query, release } = createPool(async (sql) => {
      if (sql.includes("INSERT INTO") && sql.includes("action_claims")) {
        return result([actionClaimRow]) as QueryResult<never>;
      }

      if (sql.includes("INSERT INTO") && sql.includes("course_enrollments")) {
        return result([enrollmentRow]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });
    const repository = new PostgresEnrollmentRepository(
      pool,
      "learning_runtime",
    );

    await expect(repository.createCourseEnrollment(input)).resolves.toEqual({
      created: true,
      record: {
        actionId: input.actionId,
        userId: input.userId,
        courseId: input.courseId,
        courseTitle: input.courseTitle,
        status: "enrolled",
        approvedBy: input.approvedBy,
        approvedAt: "2026-07-15T20:05:00.000Z",
      },
    });

    expect(query.mock.calls.map(([sql]) => String(sql).trim())).toEqual([
      "BEGIN",
      expect.stringContaining(
        'INSERT INTO "learning_runtime".enrollment_action_claims',
      ),
      expect.stringContaining(
        'INSERT INTO "learning_runtime".course_enrollments',
      ),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("replays a matching action without creating another enrollment", async () => {
    const { pool, query } = createPool(async (sql) => {
      if (sql.includes("INSERT INTO") && sql.includes("action_claims")) {
        return result([]) as QueryResult<never>;
      }

      if (sql.includes("FROM") && sql.includes("action_claims")) {
        return result([actionClaimRow]) as QueryResult<never>;
      }

      if (sql.includes("FROM") && sql.includes("course_enrollments")) {
        return result([enrollmentRow]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });
    const repository = new PostgresEnrollmentRepository(pool);

    await expect(repository.createCourseEnrollment(input)).resolves.toMatchObject({
      created: false,
      record: {
        actionId: "action-123",
      },
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO \"learning_copilot\".course_enrollments"),
      ),
    ).toBe(false);
  });

  it("durably claims a new action even when the user is already enrolled", async () => {
    const existingEnrollment = {
      ...enrollmentRow,
      action_id: "action-original",
    };
    const { pool, query } = createPool(async (sql) => {
      if (sql.includes("INSERT INTO") && sql.includes("action_claims")) {
        return result([actionClaimRow]) as QueryResult<never>;
      }

      if (sql.includes("INSERT INTO") && sql.includes("course_enrollments")) {
        return result([]) as QueryResult<never>;
      }

      if (sql.includes("FROM") && sql.includes("course_enrollments")) {
        return result([existingEnrollment]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });
    const repository = new PostgresEnrollmentRepository(pool);

    await expect(repository.createCourseEnrollment(input)).resolves.toMatchObject({
      created: false,
      record: {
        actionId: "action-original",
      },
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("enrollment_action_claims"),
      ),
    ).toBe(true);
  });

  it("rejects reuse of an action ID with different request data", async () => {
    const { pool, query, release } = createPool(async (sql) => {
      if (sql.includes("INSERT INTO") && sql.includes("action_claims")) {
        return result([]) as QueryResult<never>;
      }

      if (sql.includes("FROM") && sql.includes("action_claims")) {
        return result([
          {
            ...actionClaimRow,
            course_id: "course-other",
          },
        ]) as QueryResult<never>;
      }

      return result([]) as QueryResult<never>;
    });
    const repository = new PostgresEnrollmentRepository(pool);

    await expect(repository.createCourseEnrollment(input)).rejects.toBeInstanceOf(
      EnrollmentActionConflictError,
    );
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledWith(false);
  });

  it("destroys the client if transaction cleanup fails", async () => {
    const { pool, release } = createPool(async (sql) => {
      if (sql === "ROLLBACK") {
        throw new Error("rollback failed");
      }

      if (sql.includes("INSERT INTO") && sql.includes("action_claims")) {
        throw new Error("write failed");
      }

      return result([]) as QueryResult<never>;
    });
    const repository = new PostgresEnrollmentRepository(pool);

    await expect(repository.createCourseEnrollment(input)).rejects.toBeInstanceOf(
      PersistenceOperationError,
    );
    expect(release).toHaveBeenCalledWith(true);
  });

  it("lists user enrollments in the repository contract shape", async () => {
    const pool = {
      query: vi.fn(async () =>
        result([
          {
            ...enrollmentRow,
            approved_at: "2026-07-15T20:05:00.000Z",
          },
        ]),
      ),
    } as unknown as Pool;
    const repository = new PostgresEnrollmentRepository(pool);

    await expect(repository.getUserEnrollments("user-001")).resolves.toEqual([
      expect.objectContaining({
        actionId: "action-123",
        approvedAt: "2026-07-15T20:05:00.000Z",
      }),
    ]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "learning_copilot".course_enrollments'),
      ["user-001"],
    );
  });

  it("rejects unsafe schemas and invalid persisted timestamps", async () => {
    const pool = {
      query: vi.fn(async () =>
        result([
          {
            ...enrollmentRow,
            approved_at: "not-a-date",
          },
        ]),
      ),
    } as unknown as Pool;

    expect(
      () => new PostgresEnrollmentRepository(pool, "unsafe-schema"),
    ).toThrow("safe lowercase PostgreSQL identifier");

    const repository = new PostgresEnrollmentRepository(pool);

    await expect(
      repository.getUserEnrollments("user-001"),
    ).rejects.toBeInstanceOf(PersistenceOperationError);
  });
});
