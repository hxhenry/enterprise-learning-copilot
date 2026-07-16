import { openai } from "@ai-sdk/openai";

import { getServerEnvironment } from "@/lib/config/server-environment";

export function getLearningModel() {
  const { OPENAI_MODEL: modelName } = getServerEnvironment();

  return openai(modelName);
}
