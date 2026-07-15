import { openai } from "@ai-sdk/openai";

const DEFAULT_MODEL = "gpt-5.6-luna";

export function getLearningModel() {
  const modelName =
    process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  return openai(modelName);
}