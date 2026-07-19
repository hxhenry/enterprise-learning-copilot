import { getCertificationStats } from "@/data/mock-analytics-data";
import {
  createCourseEnrollment,
  getUserEnrollments,
} from "@/data/mock-enrollment-data";
import {
  completedCourseIdsByUser,
  findCertification,
  findCertificationById,
  findCourse,
  findUserById,
  getCoursesByIds,
  getNextRequiredCourse,
} from "@/data/mock-learning-data";
import { searchCourseKnowledge } from "@/lib/rag/course-knowledge";
import type {
  AnalyticsRepository,
  EnrollmentRepository,
  KnowledgeRepository,
  LearningGraphRepositories,
  LearningRepository,
} from "@/lib/repositories/contracts";

/*
 * These adapters preserve the same async contracts expected from durable
 * stores, but their business state and vector index are isolated to one Node.js
 * process. The knowledge adapter still calls the configured embedding provider.
 */
export const inMemoryLearningRepository: LearningRepository = {
  async findUserById(userId) {
    return findUserById(userId);
  },
  async findCertification(query) {
    return findCertification(query);
  },
  async findCertificationById(certificationId) {
    return findCertificationById(certificationId);
  },
  async getCoursesByIds(courseIds) {
    return getCoursesByIds(courseIds);
  },
  async findCourse(query) {
    return findCourse(query);
  },
  async getNextRequiredCourse(userId, certificationId) {
    return getNextRequiredCourse(userId, certificationId);
  },
  async getCompletedCourseIds(userId) {
    return [...(completedCourseIdsByUser[userId] ?? [])];
  },
};

export const inMemoryAnalyticsRepository: AnalyticsRepository = {
  async getCertificationStats(department) {
    return getCertificationStats(department);
  },
};

export const inMemoryEnrollmentRepository: EnrollmentRepository = {
  async createCourseEnrollment(input) {
    return createCourseEnrollment(input);
  },
  async getUserEnrollments(userId) {
    return [...getUserEnrollments(userId)];
  },
};

export const inMemoryKnowledgeRepository: KnowledgeRepository = {
  searchCourseKnowledge,
};

export const inMemoryLearningGraphRepositories: LearningGraphRepositories = {
  learning: inMemoryLearningRepository,
  analytics: inMemoryAnalyticsRepository,
  enrollment: inMemoryEnrollmentRepository,
  knowledge: inMemoryKnowledgeRepository,
};
