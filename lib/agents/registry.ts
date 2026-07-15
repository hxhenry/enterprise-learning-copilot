export const AGENT_IDS = ["tutor", "certification", "analytics"] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export type AgentDefinition = {
  id: AgentId;
  name: string;
  description: string;
  capabilities: string[];
  toolNames: string[];
  enabled: boolean;
};

export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  tutor: {
    id: "tutor",
    name: "Course Tutor Agent",
    description:
      "Explains technical course concepts and answers questions using internal course and policy documents.",
    capabilities: [
      "course questions",
      "technical explanations",
      "policy explanations",
      "document-grounded answers",
    ],
    toolNames: ["searchCourseKnowledge"],
    enabled: true,
  },

  certification: {
    id: "certification",
    name: "Certification Agent",
    description:
      "Checks employee progress, certification requirements, completed courses, and creates personalized learning plans.",
    capabilities: [
      "certification requirements",
      "employee progress",
      "learning plans",
      "remaining course identification",
    ],
    toolNames: [
      "getUserProfile",
      "getCompletedCourses",
      "getCertificationProgress",
      "getCertificationRequirements",
      "getCertificationCourses",
      "searchCourseKnowledge",
    ],
    enabled: true,
  },

  analytics: {
    id: "analytics",
    name: "Business Analytics Agent",
    description:
      "Answers manager and business questions about certification completion, overdue employees, and department risk.",
    capabilities: [
      "department statistics",
      "completion rates",
      "compliance risk",
      "business reporting",
    ],
    toolNames: ["getDepartmentCertificationStats"],
    enabled: true,
  },
};

export function getEnabledAgents(): AgentDefinition[] {
  return Object.values(AGENT_REGISTRY).filter((agent) => agent.enabled);
}

export function getAgentCatalogForPrompt(): string {
  return getEnabledAgents()
    .map(
      (agent) => `
Agent ID: ${agent.id}
Name: ${agent.name}
Description: ${agent.description}
Capabilities: ${agent.capabilities.join(", ")}
`,
    )
    .join("\n");
}
