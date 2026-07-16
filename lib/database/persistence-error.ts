import {
  WorkflowLockReleaseError,
  WorkflowLockTimeoutError,
} from "@/lib/concurrency/workflow-execution-coordinator";
import {
  PersistenceOperationError,
} from "@/lib/database/errors";
import {
  PostgresConfigurationError,
  PostgresReadinessError,
} from "@/lib/database/postgres";

export function isRetryablePersistenceError(error: unknown): boolean {
  if (
    error instanceof WorkflowLockTimeoutError ||
    error instanceof WorkflowLockReleaseError
  ) {
    return true;
  }

  if (error instanceof AggregateError) {
    return error.errors.some(isRetryablePersistenceError);
  }

  return (
    error instanceof PersistenceOperationError && error.retryable
  );
}

export function isPersistenceError(error: unknown): boolean {
  if (isRetryablePersistenceError(error)) {
    return true;
  }

  if (error instanceof AggregateError) {
    return error.errors.some(isPersistenceError);
  }

  return (
    error instanceof PersistenceOperationError ||
    error instanceof PostgresConfigurationError ||
    error instanceof PostgresReadinessError
  );
}
