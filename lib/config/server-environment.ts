import { z } from "zod";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
export const DEFAULT_OPENAI_EMBEDDING_MODEL =
  "text-embedding-3-small";

const ServerEnvironmentSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .min(1, "OPENAI_API_KEY is required."),
  OPENAI_MODEL: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_OPENAI_MODEL),
  OPENAI_EMBEDDING_MODEL: z
    .string()
    .trim()
    .min(1)
    .default(DEFAULT_OPENAI_EMBEDDING_MODEL),
});

export type ServerEnvironment = z.infer<
  typeof ServerEnvironmentSchema
>;

export class ServerEnvironmentError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid server environment: ${issues.join(" ")}`);
    this.name = "ServerEnvironmentError";
    this.issues = issues;
  }
}

export function parseServerEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ServerEnvironment {
  const result = ServerEnvironmentSchema.safeParse({
    OPENAI_API_KEY: environment.OPENAI_API_KEY,
    OPENAI_MODEL:
      environment.OPENAI_MODEL?.trim() || undefined,
    OPENAI_EMBEDDING_MODEL:
      environment.OPENAI_EMBEDDING_MODEL?.trim() || undefined,
  });

  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => issue.message),
    );
  }

  return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}
