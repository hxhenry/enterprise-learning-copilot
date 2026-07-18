export type ChatRole = "user" | "assistant";

export type CourseExperienceItem = {
  id: string;
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  durationHours: number;
};

export type DepartmentExperienceStat = {
  department: string;
  totalEmployees: number;
  completed: number;
  inProgress: number;
  overdue: number;
  completionRate: number;
  atRisk: boolean;
};

export type ApprovalRequest = {
  actionId: string;
  actionType: "course-enrollment";
  title: string;
  description: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  risk: string;
};

export type SourceExperienceItem = {
  citationId: string;
  title: string;
  source: string;
  category: string;
  excerpt: string;
};

export type ExperienceBlock =
  | {
      id: string;
      kind: "certification-progress";
      certificationId: string;
      certificationName: string;
      passingScore: number;
      completionPercent: number;
      completedCourses: CourseExperienceItem[];
      remainingCourses: CourseExperienceItem[];
    }
  | {
      id: string;
      kind: "analytics-summary";
      title: string;
      statistics: DepartmentExperienceStat[];
      highestRiskDepartment: string | null;
    }
  | {
      id: string;
      kind: "sources";
      sources: SourceExperienceItem[];
    };

export type AgentActivityStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type AgentActivity = {
  id: string;
  kind: "agent" | "tool" | "approval";
  name: string;
  detail: string;
  status: AgentActivityStatus;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  activities?: AgentActivity[];
  experienceBlocks?: ExperienceBlock[];
};

export const AGENT_EVENT_PROTOCOL_VERSION = "1.0" as const;

export const AGENT_ERROR_CODES = [
  "WORKFLOW_EXECUTION_FAILED",
  "APPROVAL_EXECUTION_FAILED",
] as const;

export type AgentErrorCode =
  (typeof AGENT_ERROR_CODES)[number];

export type AgentEventPayload =
  | {
      type: "status";
      message: string;
    }
  | {
      type: "agent-selected";
      agentId: string;
      agentName: string;
      reason: string;
    }
  | {
      type: "tool-start";
      toolName: string;
      message: string;
    }
  | {
      type: "tool-result";
      toolName: string;
      summary: string;
    }
  | {
      type: "experience";
      block: ExperienceBlock;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "done";
    }
  | {
      type: "approval-required";
      request: ApprovalRequest;
    }
  | {
      type: "approval-resolved";
      actionId: string;
      approved: boolean;
      message: string;
    }
  | {
      type: "error";
      code: AgentErrorCode;
      message: string;
      retryable: boolean;
    };

export type AgentEvent = {
  protocolVersion: typeof AGENT_EVENT_PROTOCOL_VERSION;
  sequence: number;
  emittedAt: string;
  requestId: string;
  agentRunId: string;
  threadId: string;
  payload: AgentEventPayload;
};

export type AgentEventReporter = (
  event: AgentEventPayload,
) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.actionId === "string" &&
    value.actionType === "course-enrollment" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.userId === "string" &&
    typeof value.courseId === "string" &&
    typeof value.courseTitle === "string" &&
    typeof value.risk === "string"
  );
}

function isCourseExperienceItem(value: unknown): value is CourseExperienceItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.level === "beginner" ||
      value.level === "intermediate" ||
      value.level === "advanced") &&
    isFiniteNumber(value.durationHours)
  );
}

function isDepartmentExperienceStat(
  value: unknown,
): value is DepartmentExperienceStat {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.department === "string" &&
    isFiniteNumber(value.totalEmployees) &&
    isFiniteNumber(value.completed) &&
    isFiniteNumber(value.inProgress) &&
    isFiniteNumber(value.overdue) &&
    isFiniteNumber(value.completionRate) &&
    typeof value.atRisk === "boolean"
  );
}

function isSourceExperienceItem(value: unknown): value is SourceExperienceItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.citationId === "string" &&
    typeof value.title === "string" &&
    typeof value.source === "string" &&
    typeof value.category === "string" &&
    typeof value.excerpt === "string"
  );
}

export function isExperienceBlock(value: unknown): value is ExperienceBlock {
  if (!isRecord(value) || typeof value.id !== "string") {
    return false;
  }

  switch (value.kind) {
    case "certification-progress":
      return (
        typeof value.certificationId === "string" &&
        typeof value.certificationName === "string" &&
        isFiniteNumber(value.passingScore) &&
        isFiniteNumber(value.completionPercent) &&
        Array.isArray(value.completedCourses) &&
        value.completedCourses.every(isCourseExperienceItem) &&
        Array.isArray(value.remainingCourses) &&
        value.remainingCourses.every(isCourseExperienceItem)
      );

    case "analytics-summary":
      return (
        typeof value.title === "string" &&
        Array.isArray(value.statistics) &&
        value.statistics.every(isDepartmentExperienceStat) &&
        (value.highestRiskDepartment === null ||
          typeof value.highestRiskDepartment === "string")
      );

    case "sources":
      return (
        Array.isArray(value.sources) &&
        value.sources.every(isSourceExperienceItem)
      );

    default:
      return false;
  }
}

export function isAgentEventPayload(
  value: unknown,
): value is AgentEventPayload {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "status":
      return typeof value.message === "string";

    case "approval-required":
      return isApprovalRequest(value.request);

    case "approval-resolved":
      return (
        typeof value.actionId === "string" &&
        typeof value.approved === "boolean" &&
        typeof value.message === "string"
      );

    case "agent-selected":
      return (
        typeof value.agentId === "string" &&
        typeof value.agentName === "string" &&
        typeof value.reason === "string"
      );

    case "tool-start":
      return (
        typeof value.toolName === "string" && typeof value.message === "string"
      );

    case "tool-result":
      return (
        typeof value.toolName === "string" && typeof value.summary === "string"
      );

    case "experience":
      return isExperienceBlock(value.block);

    case "token":
      return typeof value.content === "string";

    case "done":
      return true;

    case "error":
      return (
        AGENT_ERROR_CODES.some(
          (code) => code === value.code,
        ) &&
        typeof value.message === "string" &&
        typeof value.retryable === "boolean"
      );

    default:
      return false;
  }
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const parsedTimestamp = new Date(value);

  return (
    Number.isFinite(parsedTimestamp.getTime()) &&
    parsedTimestamp.toISOString() === value
  );
}

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.protocolVersion === AGENT_EVENT_PROTOCOL_VERSION &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence > 0 &&
    isIsoTimestamp(value.emittedAt) &&
    typeof value.requestId === "string" &&
    value.requestId.length > 0 &&
    typeof value.agentRunId === "string" &&
    value.agentRunId.length > 0 &&
    typeof value.threadId === "string" &&
    value.threadId.length > 0 &&
    isAgentEventPayload(value.payload)
  );
}
