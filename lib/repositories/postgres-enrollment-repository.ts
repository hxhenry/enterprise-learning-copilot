import type { Pool, PoolClient } from "pg";

import { DEFAULT_POSTGRES_SCHEMA } from "@/lib/config/server-environment";
import {
  asPersistenceOperationError,
  EnrollmentActionConflictError,
} from "@/lib/database/errors";
import type {
  CreateEnrollmentInput,
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";
import type { EnrollmentRepository } from "@/lib/repositories/contracts";

const SAFE_POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

type EnrollmentRow = {
  action_id: string;
  user_id: string;
  course_id: string;
  course_title: string;
  status: "enrolled";
  approved_by: string;
  approved_at: Date | string;
};

type ActionClaimRow = {
  action_id: string;
  user_id: string;
  course_id: string;
  course_title: string;
  approved_by: string;
};

const ENROLLMENT_COLUMNS = `
  action_id,
  user_id,
  course_id,
  course_title,
  status,
  approved_by,
  approved_at
`;

function quoteSchema(schema: string): string {
  if (!SAFE_POSTGRES_SCHEMA_PATTERN.test(schema)) {
    throw new Error(
      "The enrollment repository schema must be a safe lowercase PostgreSQL identifier.",
    );
  }

  return `"${schema}"`;
}

function toIsoTimestamp(value: Date | string): string {
  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(
      "The enrollment record contains an invalid approval timestamp.",
    );
  }

  return timestamp.toISOString();
}

function mapEnrollment(row: EnrollmentRow): EnrollmentRecord {
  return {
    actionId: row.action_id,
    userId: row.user_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: toIsoTimestamp(row.approved_at),
  };
}

function actionMatchesInput(
  row: ActionClaimRow,
  input: CreateEnrollmentInput,
): boolean {
  return (
    row.user_id === input.userId &&
    row.course_id === input.courseId &&
    row.course_title === input.courseTitle &&
    row.approved_by === input.approvedBy
  );
}

async function getEnrollmentByCourse(
  client: PoolClient,
  table: string,
  input: CreateEnrollmentInput,
): Promise<EnrollmentRow> {
  const result = await client.query<EnrollmentRow>(
    `
      SELECT ${ENROLLMENT_COLUMNS}
      FROM ${table}
      WHERE user_id = $1 AND course_id = $2
    `,
    [input.userId, input.courseId],
  );
  const enrollment = result.rows[0];

  if (!enrollment) {
    throw new Error(
      "An enrollment action was claimed, but its enrollment record was not found.",
    );
  }

  return enrollment;
}

export class PostgresEnrollmentRepository implements EnrollmentRepository {
  private readonly actionClaimsTable: string;
  private readonly enrollmentsTable: string;

  constructor(
    private readonly pool: Pool,
    schema: string = DEFAULT_POSTGRES_SCHEMA,
  ) {
    const quotedSchema = quoteSchema(schema);

    this.actionClaimsTable = `${quotedSchema}.enrollment_action_claims`;
    this.enrollmentsTable = `${quotedSchema}.course_enrollments`;
  }

  async createCourseEnrollment(
    input: CreateEnrollmentInput,
  ): Promise<EnrollmentResult> {
    let client: PoolClient;

    try {
      client = await this.pool.connect();
    } catch (error) {
      throw asPersistenceOperationError(error);
    }

    let safeToReuseClient = true;

    try {
      await client.query("BEGIN");

      const claimResult = await client.query<ActionClaimRow>(
        `
          INSERT INTO ${this.actionClaimsTable} (
            action_id,
            user_id,
            course_id,
            course_title,
            approved_by
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (action_id) DO NOTHING
          RETURNING action_id, user_id, course_id, course_title, approved_by
        `,
        [
          input.actionId,
          input.userId,
          input.courseId,
          input.courseTitle,
          input.approvedBy,
        ],
      );
      const newClaim = claimResult.rows[0];

      if (!newClaim) {
        const existingClaimResult = await client.query<ActionClaimRow>(
          `
            SELECT action_id, user_id, course_id, course_title, approved_by
            FROM ${this.actionClaimsTable}
            WHERE action_id = $1
          `,
          [input.actionId],
        );
        const existingClaim = existingClaimResult.rows[0];

        if (!existingClaim || !actionMatchesInput(existingClaim, input)) {
          throw new EnrollmentActionConflictError(input.actionId);
        }

        const enrollment = await getEnrollmentByCourse(
          client,
          this.enrollmentsTable,
          input,
        );

        const record = mapEnrollment(enrollment);

        await client.query("COMMIT");

        return {
          record,
          created: false,
        };
      }

      const enrollmentResult = await client.query<EnrollmentRow>(
        `
          INSERT INTO ${this.enrollmentsTable} (
            action_id,
            user_id,
            course_id,
            course_title,
            approved_by
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, course_id) DO NOTHING
          RETURNING ${ENROLLMENT_COLUMNS}
        `,
        [
          input.actionId,
          input.userId,
          input.courseId,
          input.courseTitle,
          input.approvedBy,
        ],
      );
      const createdEnrollment = enrollmentResult.rows[0];
      const enrollment =
        createdEnrollment ??
        (await getEnrollmentByCourse(
          client,
          this.enrollmentsTable,
          input,
        ));

      const record = mapEnrollment(enrollment);

      await client.query("COMMIT");

      return {
        record,
        created: Boolean(createdEnrollment),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        safeToReuseClient = false;
        throw asPersistenceOperationError(
          new AggregateError(
            [error, rollbackError],
            "Enrollment persistence and transaction cleanup both failed.",
          ),
        );
      }

      if (error instanceof EnrollmentActionConflictError) {
        throw error;
      }

      throw asPersistenceOperationError(error);
    } finally {
      client.release(!safeToReuseClient);
    }
  }

  async getUserEnrollments(userId: string): Promise<EnrollmentRecord[]> {
    try {
      const result = await this.pool.query<EnrollmentRow>(
        `
          SELECT ${ENROLLMENT_COLUMNS}
          FROM ${this.enrollmentsTable}
          WHERE user_id = $1
          ORDER BY approved_at ASC, action_id ASC
        `,
        [userId],
      );

      return result.rows.map(mapEnrollment);
    } catch (error) {
      throw asPersistenceOperationError(error);
    }
  }
}
