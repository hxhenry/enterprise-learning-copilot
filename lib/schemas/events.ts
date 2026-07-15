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
  kind: "agent" | "tool";
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

export type AgentEvent =
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
      type: "error";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCourseExperienceItem(
  value: unknown,
): value is CourseExperienceItem {
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

function isSourceExperienceItem(
  value: unknown,
): value is SourceExperienceItem {
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

export function isExperienceBlock(
  value: unknown,
): value is ExperienceBlock {
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

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "status":
      return typeof value.message === "string";

    case "agent-selected":
      return (
        typeof value.agentId === "string" &&
        typeof value.agentName === "string" &&
        typeof value.reason === "string"
      );

    case "tool-start":
      return (
        typeof value.toolName === "string" &&
        typeof value.message === "string"
      );

    case "tool-result":
      return (
        typeof value.toolName === "string" &&
        typeof value.summary === "string"
      );

    case "experience":
      return isExperienceBlock(value.block);

    case "token":
      return typeof value.content === "string";

    case "done":
      return true;

    case "error":
      return typeof value.message === "string";

    default:
      return false;
  }
}