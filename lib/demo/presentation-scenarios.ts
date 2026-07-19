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
      "Searches internal learning documents and renders cited sources.",
    prompt:
      "Using our internal course documents, explain the principle of least privilege and cite the sources you use.",
  },
  {
    id: "certification-progress",
    step: "02 · Tool calling",
    title: "Check certification progress",
    description:
      "Calculates trusted progress and recommends the next required course.",
    prompt:
      "How am I progressing toward the Cloud Security Certification, and which course should I take next?",
  },
  {
    id: "analytics-risk",
    step: "03 · Business analytics",
    title: "Identify department risk",
    description:
      "Uses deterministic metrics to identify the highest-risk department.",
    prompt:
      "Which department is most at risk for certification completion, and what numbers support that conclusion?",
  },
  {
    id: "enrollment-approval",
    step: "04 · Human approval",
    title: "Request course enrollment",
    description:
      "Pauses enrollment until the user explicitly approves or rejects it.",
    prompt: "Enroll me in Secure Cloud Networking.",
  },
] as const satisfies readonly PresentationScenario[];
