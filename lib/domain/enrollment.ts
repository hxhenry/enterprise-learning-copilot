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

export type CreateEnrollmentInput = {
  actionId: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  approvedBy: string;
};
