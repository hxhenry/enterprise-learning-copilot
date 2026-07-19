import type {
  CreateEnrollmentInput,
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";

export type {
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";

/*
 * Demo-only process state. The checks below express the repository idempotency
 * contract but are not transactional; a production adapter must enforce both
 * uniqueness rules in its storage layer.
 */
const enrollmentRecords: EnrollmentRecord[] = [];

export function createCourseEnrollment({
  actionId,
  userId,
  courseId,
  courseTitle,
  approvedBy,
}: CreateEnrollmentInput): EnrollmentResult {
  const existingAction = enrollmentRecords.find(
    (record) => record.actionId === actionId,
  );

  if (existingAction) {
    return {
      record: existingAction,
      created: false,
    };
  }

  // A new action ID can still repeat an enrollment intent already completed.
  const existingEnrollment = enrollmentRecords.find(
    (record) =>
      record.userId === userId &&
      record.courseId === courseId,
  );

  if (existingEnrollment) {
    return {
      record: existingEnrollment,
      created: false,
    };
  }

  const record: EnrollmentRecord = {
    actionId,
    userId,
    courseId,
    courseTitle,
    status: "enrolled",
    approvedBy,
    approvedAt: new Date().toISOString(),
  };

  enrollmentRecords.push(record);

  return {
    record,
    created: true,
  };
}

export function getUserEnrollments(
  userId: string,
): EnrollmentRecord[] {
  return enrollmentRecords.filter(
    (record) => record.userId === userId,
  );
}
