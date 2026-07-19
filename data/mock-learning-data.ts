import type {
  Certification,
  Course,
  LearningUser,
} from "@/lib/domain/learning";

export type {
  Certification,
  Course,
  LearningUser,
} from "@/lib/domain/learning";

export const users: LearningUser[] = [
  {
    id: "user-001",
    name: "Henry",
    role: "Frontend Engineer",
    department: "Engineering",
  },
];

export const courses: Course[] = [
  {
    id: "course-cloud-101",
    title: "Cloud Security Fundamentals",
    topic: "Cloud Security",
    level: "beginner",
    durationHours: 4,
  },
  {
    id: "course-iam-201",
    title: "Identity and Access Management",
    topic: "Identity and Access Management",
    level: "intermediate",
    durationHours: 5,
  },
  {
    id: "course-network-301",
    title: "Secure Cloud Networking",
    topic: "Network Security",
    level: "intermediate",
    durationHours: 5,
  },
  {
    id: "course-incident-401",
    title: "Cloud Incident Response",
    topic: "Incident Response",
    level: "advanced",
    durationHours: 6,
  },
];

export const certifications: Certification[] = [
  {
    id: "cert-cloud-security",
    name: "Cloud Security Certification",
    description:
      "Validates knowledge of cloud security, identity management, secure networking, and incident response.",
    passingScore: 80,
    requiredCourseIds: [
      "course-cloud-101",
      "course-iam-201",
      "course-network-301",
      "course-incident-401",
    ],
  },
];

export const completedCourseIdsByUser: Record<string, string[]> = {
  "user-001": ["course-cloud-101", "course-iam-201"],
};

export function findUserById(userId: string): LearningUser | undefined {
  return users.find((user) => user.id === userId);
}

export function findCertification(
  query: string,
): Certification | undefined {
  const normalizedQuery = query.trim().toLowerCase();

  return certifications.find(
    (certification) =>
      certification.id.toLowerCase() === normalizedQuery ||
      certification.name.toLowerCase().includes(normalizedQuery) ||
      normalizedQuery.includes(certification.name.toLowerCase()),
  );
}

export function findCertificationById(
  certificationId: string,
): Certification | undefined {
  return certifications.find(
    (certification) => certification.id === certificationId,
  );
}

export function getCoursesByIds(courseIds: string[]): Course[] {
  const courseIdSet = new Set(courseIds);

  return courses.filter((course) => courseIdSet.has(course.id));
}

export function findCourse(
  query: string,
): Course | undefined {
  const normalizedQuery = query
    .trim()
    .toLowerCase();

  return courses.find(
    (course) =>
      course.id.toLowerCase() === normalizedQuery ||
      course.title
        .toLowerCase()
        .includes(normalizedQuery) ||
      normalizedQuery.includes(
        course.title.toLowerCase(),
      ),
  );
}

export function getNextRequiredCourse(
  userId: string,
  certificationId: string,
): Course | undefined {
  const certification =
    findCertificationById(certificationId);

  if (!certification) {
    return undefined;
  }

  const completedCourseIds = new Set(
    completedCourseIdsByUser[userId] ?? [],
  );

  const requiredCourses = getCoursesByIds(
    certification.requiredCourseIds,
  );

  return requiredCourses.find(
    (course) => !completedCourseIds.has(course.id),
  );
}
