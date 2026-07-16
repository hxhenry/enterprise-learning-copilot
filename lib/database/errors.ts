export class DatabaseMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseMigrationError";
  }
}

const TRANSIENT_NODE_ERROR_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
  "40001",
  "40P01",
  "53300",
  "53400",
  "55P03",
  "57014",
  "57P01",
  "57P02",
  "57P03",
]);

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

function isRetryableDatabaseCause(
  error: unknown,
  visited: WeakSet<object> = new WeakSet(),
): boolean {
  if (typeof error === "object" && error !== null) {
    if (visited.has(error)) {
      return false;
    }

    visited.add(error);
  }

  if (error instanceof AggregateError) {
    return error.errors.some((child) =>
      isRetryableDatabaseCause(child, visited),
    );
  }

  const code = getErrorCode(error);

  if (
    code !== undefined &&
    (code.startsWith("08") ||
      TRANSIENT_NODE_ERROR_CODES.has(code) ||
      TRANSIENT_POSTGRES_ERROR_CODES.has(code))
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    (/^(?:timeout exceeded when trying to connect|connection terminated due to connection timeout|query read timeout|connection terminated unexpectedly|connection terminated)$/i.test(
      error.message.trim(),
    ) ||
      ("cause" in error &&
        isRetryableDatabaseCause(error.cause, visited)))
  );
}

export class PersistenceOperationError extends Error {
  readonly retryable: boolean;

  constructor(cause: unknown) {
    super("A persistence operation failed.", {
      cause: cause instanceof Error ? cause : undefined,
    });
    this.name = "PersistenceOperationError";
    this.retryable = isRetryableDatabaseCause(cause);
  }
}

export function asPersistenceOperationError(
  error: unknown,
): PersistenceOperationError {
  return error instanceof PersistenceOperationError
    ? error
    : new PersistenceOperationError(error);
}

export class EnrollmentActionConflictError extends Error {
  readonly actionId: string;

  constructor(actionId: string) {
    super(
      `Enrollment action "${actionId}" was already used with different request data.`,
    );
    this.name = "EnrollmentActionConflictError";
    this.actionId = actionId;
  }
}
