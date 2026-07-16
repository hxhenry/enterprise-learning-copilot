import { z } from "zod";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
export const DEFAULT_OPENAI_EMBEDDING_MODEL =
  "text-embedding-3-small";
export const DEFAULT_PERSISTENCE_BACKEND = "memory";
export const DEFAULT_POSTGRES_SCHEMA = "learning_copilot";
export const DEFAULT_POSTGRES_POOL_MAX = 10;
export const DEFAULT_POSTGRES_WORKFLOW_LOCK_POOL_MAX = 5;
export const DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS = 5_000;
export const DEFAULT_POSTGRES_IDLE_TIMEOUT_MS = 30_000;
export const DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS = 5_000;

export const PERSISTENCE_BACKENDS = ["memory", "postgres"] as const;

const SAFE_POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const SAFE_DATABASE_URL_PARAMETERS = new Map([
  [
    "sslmode",
    new Set(["disable", "prefer", "require", "verify-ca", "verify-full"]),
  ],
  ["sslnegotiation", new Set(["postgres", "direct"])],
]);

function isPostgresqlUrl(value: string): boolean {
  if (/\s|[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);

    for (const parameter of new Set(url.searchParams.keys())) {
      const allowedValues = SAFE_DATABASE_URL_PARAMETERS.get(parameter);
      const configuredValues = url.searchParams.getAll(parameter);

      if (
        !allowedValues ||
        configuredValues.length !== 1 ||
        !allowedValues.has(configuredValues[0])
      ) {
        return false;
      }
    }

    return (
      url.protocol === "postgresql:" &&
      url.hostname.length > 0 &&
      url.pathname.length > 1 &&
      url.hash.length === 0
    );
  } catch {
    return false;
  }
}

const PositiveBoundedMillisecondsSchema = z.coerce
  .number()
  .int()
  .min(100)
  .max(300_000);

const ModelEnvironmentSchema = z.object({
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

const PersistenceEnvironmentBaseSchema = z.object({
  PERSISTENCE_BACKEND: z
    .enum(PERSISTENCE_BACKENDS)
    .default(DEFAULT_PERSISTENCE_BACKEND),
  DATABASE_URL: z
    .string()
    .trim()
    .refine(isPostgresqlUrl, {
      message:
        "DATABASE_URL must be a valid postgresql:// URL with a host and database name.",
    })
    .transform((value) => new URL(value).toString())
    .optional(),
  POSTGRES_SCHEMA: z
    .string()
    .trim()
    .regex(
      SAFE_POSTGRES_SCHEMA_PATTERN,
      "POSTGRES_SCHEMA must be a safe lowercase PostgreSQL identifier.",
    )
    .default(DEFAULT_POSTGRES_SCHEMA),
  POSTGRES_POOL_MAX: z.coerce
    .number()
    .int()
    .min(2, "POSTGRES_POOL_MAX must be at least 2.")
    .max(100)
    .default(DEFAULT_POSTGRES_POOL_MAX),
  POSTGRES_WORKFLOW_LOCK_POOL_MAX: z.coerce
    .number()
    .int()
    .min(1, "POSTGRES_WORKFLOW_LOCK_POOL_MAX must be at least 1.")
    .max(100)
    .default(DEFAULT_POSTGRES_WORKFLOW_LOCK_POOL_MAX),
  POSTGRES_CONNECTION_TIMEOUT_MS:
    PositiveBoundedMillisecondsSchema.default(
      DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
    ),
  POSTGRES_IDLE_TIMEOUT_MS:
    PositiveBoundedMillisecondsSchema.default(
      DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
    ),
  POSTGRES_STATEMENT_TIMEOUT_MS:
    PositiveBoundedMillisecondsSchema.default(
      DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS,
    ),
  POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS:
    PositiveBoundedMillisecondsSchema.default(
      DEFAULT_POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS,
    ),
});

function validatePersistenceEnvironment(
  environment: z.infer<typeof PersistenceEnvironmentBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (
    environment.PERSISTENCE_BACKEND === "postgres" &&
    !environment.DATABASE_URL
  ) {
    context.addIssue({
      code: "custom",
      path: ["DATABASE_URL"],
      message:
        "DATABASE_URL is required when PERSISTENCE_BACKEND is postgres.",
    });
  }
}

const PersistenceEnvironmentSchema =
  PersistenceEnvironmentBaseSchema.superRefine(
    validatePersistenceEnvironment,
  );

const ServerEnvironmentSchema = z
  .object({
    ...ModelEnvironmentSchema.shape,
    ...PersistenceEnvironmentBaseSchema.shape,
  })
  .superRefine(validatePersistenceEnvironment);

export type ServerEnvironment = z.infer<
  typeof ServerEnvironmentSchema
>;

export type PersistenceEnvironment = z.infer<
  typeof PersistenceEnvironmentSchema
>;

export type PersistenceBackend =
  (typeof PERSISTENCE_BACKENDS)[number];

export class ServerEnvironmentError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid server environment: ${issues.join(" ")}`);
    this.name = "ServerEnvironmentError";
    this.issues = issues;
  }
}

function persistenceEnvironmentInput(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return {
    PERSISTENCE_BACKEND:
      environment.PERSISTENCE_BACKEND?.trim() || undefined,
    DATABASE_URL: environment.DATABASE_URL?.trim() || undefined,
    POSTGRES_SCHEMA:
      environment.POSTGRES_SCHEMA?.trim() || undefined,
    POSTGRES_POOL_MAX:
      environment.POSTGRES_POOL_MAX?.trim() || undefined,
    POSTGRES_WORKFLOW_LOCK_POOL_MAX:
      environment.POSTGRES_WORKFLOW_LOCK_POOL_MAX?.trim() ||
      undefined,
    POSTGRES_CONNECTION_TIMEOUT_MS:
      environment.POSTGRES_CONNECTION_TIMEOUT_MS?.trim() || undefined,
    POSTGRES_IDLE_TIMEOUT_MS:
      environment.POSTGRES_IDLE_TIMEOUT_MS?.trim() || undefined,
    POSTGRES_STATEMENT_TIMEOUT_MS:
      environment.POSTGRES_STATEMENT_TIMEOUT_MS?.trim() || undefined,
    POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS:
      environment.POSTGRES_WORKFLOW_LOCK_TIMEOUT_MS?.trim() || undefined,
  };
}

function throwEnvironmentIssues(
  issues: readonly { message: string }[],
): never {
  throw new ServerEnvironmentError(
    issues.map((issue) => issue.message),
  );
}

export function parsePersistenceEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): PersistenceEnvironment {
  const result = PersistenceEnvironmentSchema.safeParse(
    persistenceEnvironmentInput(environment),
  );

  if (!result.success) {
    throwEnvironmentIssues(result.error.issues);
  }

  return result.data;
}

export function getPersistenceEnvironment(): PersistenceEnvironment {
  return parsePersistenceEnvironment(process.env);
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
    ...persistenceEnvironmentInput(environment),
  });

  if (!result.success) {
    throwEnvironmentIssues(result.error.issues);
  }

  return result.data;
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}
