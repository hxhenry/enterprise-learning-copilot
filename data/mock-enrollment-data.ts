import type {
  CreateEnrollmentInput,
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";

export type {
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";

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
