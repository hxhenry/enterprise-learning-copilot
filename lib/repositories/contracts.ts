import type {
  Certification,
  Course,
  LearningUser,
} from "@/lib/domain/learning";
import type {
  CreateEnrollmentInput,
  EnrollmentRecord,
  EnrollmentResult,
} from "@/lib/domain/enrollment";
import type { DepartmentCertificationResult } from "@/lib/domain/analytics";
import type { RetrievedKnowledge } from "@/lib/domain/knowledge";

export interface LearningRepository {
  findUserById(
    userId: string,
  ): Promise<LearningUser | undefined>;
  findCertification(
    query: string,
  ): Promise<Certification | undefined>;
  findCertificationById(
    certificationId: string,
  ): Promise<Certification | undefined>;
  getCoursesByIds(courseIds: string[]): Promise<Course[]>;
  findCourse(query: string): Promise<Course | undefined>;
  getNextRequiredCourse(
    userId: string,
    certificationId: string,
  ): Promise<Course | undefined>;
  getCompletedCourseIds(userId: string): Promise<string[]>;
}

export interface AnalyticsRepository {
  getCertificationStats(
    department?: string,
  ): Promise<DepartmentCertificationResult[]>;
}

export interface EnrollmentRepository {
  /**
   * Implementations must atomically deduplicate retries by action ID and avoid
   * duplicate enrollment for the same user/course pair.
   */
  createCourseEnrollment(
    input: CreateEnrollmentInput,
  ): Promise<EnrollmentResult>;
  getUserEnrollments(
    userId: string,
  ): Promise<EnrollmentRecord[]>;
}

export interface KnowledgeRepository {
  /**
   * An empty result means no passage satisfied the adapter's relevance policy.
   */
  searchCourseKnowledge(
    query: string,
    limit?: number,
  ): Promise<RetrievedKnowledge[]>;
}

export type LearningGraphRepositories = {
  learning: LearningRepository;
  analytics: AnalyticsRepository;
  enrollment: EnrollmentRepository;
  knowledge: KnowledgeRepository;
};
