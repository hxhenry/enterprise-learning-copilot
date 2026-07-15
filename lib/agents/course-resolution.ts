import {
  findCourse,
  getNextRequiredCourse,
  type Course,
} from "@/data/mock-learning-data";
import type { ConversationTurn } from "@/lib/agents/state";

const DEFAULT_CERTIFICATION_ID =
  "cert-cloud-security";

const NEXT_COURSE_PATTERN =
  /\bnext(?:\s+(?:required|recommended))?\s+course\b/i;

export function isNextCourseRequest(
  message: string,
): boolean {
  return NEXT_COURSE_PATTERN.test(message);
}

export function resolveRequestedCourse({
  userMessage,
  conversation,
  userId,
  certificationId = DEFAULT_CERTIFICATION_ID,
}: {
  userMessage: string;
  conversation: ConversationTurn[];
  userId: string;
  certificationId?: string;
}): Course | undefined {
  if (isNextCourseRequest(userMessage)) {
    return getNextRequiredCourse(
      userId,
      certificationId,
    );
  }

  const directMatch = findCourse(userMessage);

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

  return findCourse(recentContext);
}