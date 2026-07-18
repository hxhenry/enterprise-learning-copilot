export type PresentationScenario = {
  id:
    | "grounded-rag"
    | "certification-progress"
    | "analytics-risk"
    | "enrollment-approval";
  step: string;
  title: string;
  description: string;
  prompt: string;
};

export const PRESENTATION_SCENARIOS = [
  {
    id: "grounded-rag",
    step: "01 · Grounded RAG",
    title: "Explain least privilege",
    description:
      "Routes to the tutor, searches internal learning documents, and returns cited sources.",
    prompt:
      "Using our internal course documents, explain the principle of least privilege and cite the sources you use.",
  },
  {
    id: "certification-progress",
    step: "02 · Tool calling",
    title: "Check certification progress",
    description:
      "Uses trusted learning data to calculate progress and recommend the next required course.",
    prompt:
      "How am I progressing toward the Cloud Security Certification, and which course should I take next?",
  },
  {
    id: "analytics-risk",
    step: "03 · Business analytics",
    title: "Identify department risk",
    description:
      "Routes a manager question to the analytics agent and supports the answer with calculated metrics.",
    prompt:
      "Which department is most at risk for certification completion, and what numbers support that conclusion?",
  },
  {
    id: "enrollment-approval",
    step: "04 · Human approval",
    title: "Request course enrollment",
    description:
      "Pauses a write action for an explicit approve-or-reject decision before changing demo data.",
    prompt: "Enroll me in Secure Cloud Networking.",
  },
] as const satisfies readonly PresentationScenario[];
