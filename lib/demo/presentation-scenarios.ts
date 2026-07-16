export type PresentationScenario = {
  id: string;
  step: string;
  capability: string;
  title: string;
  description: string;
  prompt: string;
};

export const PRESENTATION_SCENARIOS: readonly PresentationScenario[] = [
  {
    id: "grounded-iam",
    step: "01",
    capability: "Tutor · RAG",
    title: "Ground an IAM answer",
    description:
      "Routes to the tutor, retrieves internal material, and renders citation evidence.",
    prompt:
      "Using our internal learning material, explain the principle of least privilege and cite your sources.",
  },
  {
    id: "certification-progress",
    step: "02",
    capability: "Tools · UI card",
    title: "Build a learning plan",
    description:
      "Calculates the demo employee's progress and renders trusted structured data.",
    prompt:
      "Show my progress toward the Cloud Security Certification and recommend what I should take next.",
  },
  {
    id: "department-analytics",
    step: "03",
    capability: "Analytics agent",
    title: "Surface business risk",
    description:
      "Calls the analytics tool and compares aggregate certification outcomes.",
    prompt:
      "Compare certification completion across departments and identify the highest-risk department.",
  },
  {
    id: "approval-enrollment",
    step: "04",
    capability: "Human approval",
    title: "Gate a write action",
    description:
      "Interrupts the graph before an enrollment write and waits for an explicit decision.",
    prompt: "Enroll me in Secure Cloud Networking.",
  },
] as const;
