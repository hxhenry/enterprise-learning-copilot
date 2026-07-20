import type { ConversationTurn } from "@/lib/agents/state";
import type { Course } from "@/lib/domain/learning";
import type { LearningRepository } from "@/lib/repositories/contracts";
import { inMemoryLearningRepository } from "@/lib/repositories/in-memory-repositories";

const DEFAULT_CERTIFICATION_ID =
  "cert-cloud-security";

const NEXT_COURSE_PATTERN =
  /\bnext(?:\s+(?:required|recommended))?\s+course\b/i;

const ENROLLMENT_TARGET_PATTERN =
  /\b(?:enroll(?:\s+me)?(?:\s+in)?|register(?:\s+me)?(?:\s+(?:in|for))?|sign\s+(?:me\s+)?up(?:\s+for)?)\s+([^.!?]+?)\s*[.!?]*$/i;

const CONTEXTUAL_COURSE_TARGET_PATTERN =
  /^(?:it|that|this|(?:that|this|same)\s+(?:course|class|one)|the\s+one(?:\s+(?:you\s+)?(?:just\s+)?(?:mentioned|recommended|suggested))?|(?:the\s+)?(?:course|class|one)\s+(?:you\s+)?(?:just\s+)?(?:mentioned|recommended|suggested)|your\s+(?:recommended|suggested)\s+(?:course|class))$/i;

export function isNextCourseRequest(
  message: string,
): boolean {
  return NEXT_COURSE_PATTERN.test(message);
}

export function hasContextualCourseReference(
  message: string,
): boolean {
  const target = ENROLLMENT_TARGET_PATTERN.exec(message)?.[1]?.trim();

  return Boolean(
    target && CONTEXTUAL_COURSE_TARGET_PATTERN.test(target),
  );
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

  /*
   * Fail closed for an explicit unknown title. Conversation fallback is only
   * allowed for anaphoric requests, and only the immediately preceding turn is
   * considered so a stale course name cannot become a write target.
   */
  if (!hasContextualCourseReference(userMessage)) {
    return undefined;
  }

  const conversationBeforeRequest =
    conversation.at(-1)?.role === "user" &&
    conversation.at(-1)?.content.trim() === userMessage.trim()
      ? conversation.slice(0, -1)
      : conversation;

  const previousTurn = conversationBeforeRequest.at(-1);

  if (!previousTurn?.content.trim()) {
    return undefined;
  }

  return repository.findCourse(previousTurn.content);
}
