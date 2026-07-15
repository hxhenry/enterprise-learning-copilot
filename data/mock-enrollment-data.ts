export type EnrollmentRecord = {
  actionId: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  status: "enrolled";
  approvedBy: string;
  approvedAt: string;
};

export type EnrollmentResult = {
  record: EnrollmentRecord;
  created: boolean;
};

const enrollmentRecords: EnrollmentRecord[] = [];

export function createCourseEnrollment({
  actionId,
  userId,
  courseId,
  courseTitle,
  approvedBy,
}: {
  actionId: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  approvedBy: string;
}): EnrollmentResult {
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