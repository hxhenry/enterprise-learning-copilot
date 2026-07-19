import type { ConversationTurn } from "@/lib/agents/state";
import type { Course } from "@/lib/domain/learning";
import type { LearningRepository } from "@/lib/repositories/contracts";
import { inMemoryLearningRepository } from "@/lib/repositories/in-memory-repositories";

const DEFAULT_CERTIFICATION_ID =
  "cert-cloud-security";

const NEXT_COURSE_PATTERN =
  /\bnext(?:\s+(?:required|recommended))?\s+course\b/i;

export function isNextCourseRequest(
  message: string,
): boolean {
  return NEXT_COURSE_PATTERN.test(message);
}

export async function resolveRequestedCourse(
  {
    userMessage,
    conversation,
    userId,
    certificationId = DEFAULT_CERTIFICATION_ID,
  }: {
    userMessage: string;
    conversation: ConversationTurn[];
    userId: string;
    certificationId?: string;
  },
  repository: LearningRepository = inMemoryLearningRepository,
): Promise<Course | undefined> {
  if (isNextCourseRequest(userMessage)) {
    return repository.getNextRequiredCourse(
      userId,
      certificationId,
    );
  }

  /*
   * Enrollment targets stay server-resolved rather than model-selected. Recent
   * context is consulted only after a direct match so follow-ups such as
   * "enroll me in that course" can resolve deterministically.
   */
  const directMatch = await repository.findCourse(userMessage);

  if (directMatch) {
    return directMatch;
  }

  const recentContext = conversation
    .slice(-6)
    .map((turn) => turn.content)
    .join("\n");

  if (!recentContext.trim()) {
    return undefined;
  }

  return repository.findCourse(recentContext);
}
