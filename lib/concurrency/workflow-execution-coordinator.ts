import type { Pool, PoolClient, QueryResult } from "pg";

import { KeyedSerialExecutor } from "@/lib/concurrency/keyed-serial-executor";
import { asPersistenceOperationError } from "@/lib/database/errors";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_LOCK_POLL_INTERVAL_MS = 50;

const TRY_LOCK_SQL = `
  SELECT pg_try_advisory_lock(
    hashtextextended($1::text, 0)
  ) AS acquired
`;

const UNLOCK_SQL = `
  SELECT pg_advisory_unlock(
    hashtextextended($1::text, 0)
  ) AS released
`;

export type WorkflowExecutionOptions = {
  signal?: AbortSignal;
};

export interface WorkflowExecutionCoordinator {
  run<T>(
    key: string,
    operation: () => Promise<T>,
    options?: WorkflowExecutionOptions,
  ): Promise<T>;
}

export type PostgresWorkflowExecutionCoordinatorOptions = {
  lockTimeoutMs?: number;
  pollIntervalMs?: number;
};

export class WorkflowLockTimeoutError extends Error {
  constructor() {
    super(
      "The workflow is busy and its execution lock could not be acquired in time.",
    );
    this.name = "WorkflowLockTimeoutError";
  }
}

export class WorkflowExecutionAbortedError extends Error {
  constructor() {
    super("The workflow execution was cancelled.");
    this.name = "AbortError";
  }
}

export class WorkflowLockReleaseError extends Error {
  constructor() {
    super("The workflow execution lock could not be released safely.");
    this.name = "WorkflowLockReleaseError";
  }
}

function assertExecutionKey(key: string): void {
  if (key.trim().length === 0) {
    throw new Error("A workflow execution key is required.");
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new WorkflowExecutionAbortedError();
  }
}

function normalizeCoordinatorError(error: unknown): unknown {
  if (
    error instanceof WorkflowExecutionAbortedError ||
    error instanceof WorkflowLockTimeoutError ||
    error instanceof WorkflowLockReleaseError
  ) {
    return error;
  }

  return asPersistenceOperationError(error);
}

function waitForDelay(
  durationMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);

    function handleAbort() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      reject(new WorkflowExecutionAbortedError());
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function waitWithinDeadline<T>(
  operation: Promise<T>,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  throwIfAborted(signal);

  const remainingMs = deadline - Date.now();

  if (remainingMs <= 0) {
    void operation.catch(() => undefined);
    return Promise.reject(new WorkflowLockTimeoutError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new WorkflowLockTimeoutError()));
    }, remainingMs);

    function handleAbort() {
      settle(() => reject(new WorkflowExecutionAbortedError()));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });

    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

async function connectWithinDeadline(
  pool: Pool,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<PoolClient> {
  const connection = pool.connect();

  try {
    return await waitWithinDeadline(connection, deadline, signal);
  } catch (error) {
    void connection.then(
      (lateClient) => lateClient.release(true),
      () => undefined,
    );
    throw error;
  }
}

async function queryWithinDeadline<Row extends Record<string, unknown>>(
  query: Promise<QueryResult<Row>>,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<QueryResult<Row>> {
  try {
    return await waitWithinDeadline(query, deadline, signal);
  } catch (error) {
    void query.catch(() => undefined);
    throw error;
  }
}

export class InMemoryWorkflowExecutionCoordinator
  implements WorkflowExecutionCoordinator
{
  constructor(
    private readonly executor = new KeyedSerialExecutor(),
  ) {}

  run<T>(
    key: string,
    operation: () => Promise<T>,
    options: WorkflowExecutionOptions = {},
  ): Promise<T> {
    assertExecutionKey(key);

    return this.executor.run(key, async () => {
      throwIfAborted(options.signal);
      return operation();
    });
  }
}

export class PostgresWorkflowExecutionCoordinator
  implements WorkflowExecutionCoordinator
{
  private readonly lockTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(
    private readonly pool: Pool,
    options: PostgresWorkflowExecutionCoordinatorOptions = {},
  ) {
    this.lockTimeoutMs =
      options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.pollIntervalMs =
      options.pollIntervalMs ?? DEFAULT_LOCK_POLL_INTERVAL_MS;

    if (
      !Number.isInteger(this.lockTimeoutMs) ||
      this.lockTimeoutMs <= 0 ||
      this.lockTimeoutMs > 300_000 ||
      !Number.isInteger(this.pollIntervalMs) ||
      this.pollIntervalMs <= 0
    ) {
      throw new Error(
        "Workflow lock timeouts must be positive integer milliseconds.",
      );
    }
  }

  async run<T>(
    key: string,
    operation: () => Promise<T>,
    options: WorkflowExecutionOptions = {},
  ): Promise<T> {
    assertExecutionKey(key);
    throwIfAborted(options.signal);

    const deadline = Date.now() + this.lockTimeoutMs;
    let client: PoolClient;

    try {
      client = await connectWithinDeadline(
        this.pool,
        deadline,
        options.signal,
      );
    } catch (error) {
      throw normalizeCoordinatorError(error);
    }
    let safeToReuseClient = true;
    let lockAcquired = false;

    try {
      while (!lockAcquired) {
        safeToReuseClient = false;

        let lockResult: QueryResult<{ acquired: boolean }>;

        try {
          lockResult = await queryWithinDeadline<{ acquired: boolean }>(
            client.query(TRY_LOCK_SQL, [key]),
            deadline,
            options.signal,
          );
        } catch (error) {
          throw normalizeCoordinatorError(error);
        }

        lockAcquired = lockResult.rows[0]?.acquired === true;
        safeToReuseClient = !lockAcquired;

        if (!lockAcquired) {
          const remainingMs = deadline - Date.now();

          if (remainingMs <= 0) {
            throw new WorkflowLockTimeoutError();
          }

          await waitForDelay(
            Math.min(this.pollIntervalMs, remainingMs),
            options.signal,
          );
        }
      }

      let operationResult: T | undefined;
      let operationError: unknown;
      let operationFailed = false;

      try {
        operationResult = await operation();
      } catch (error) {
        operationFailed = true;
        operationError = error;
      }

      let unlockError: unknown;

      try {
        const unlockResult = await client.query<{ released: boolean }>(
          UNLOCK_SQL,
          [key],
        );

        if (unlockResult.rows[0]?.released !== true) {
          throw new WorkflowLockReleaseError();
        }

        safeToReuseClient = true;
      } catch (error) {
        unlockError =
          error instanceof WorkflowLockReleaseError
            ? error
            : new WorkflowLockReleaseError();
      }

      if (operationFailed && unlockError) {
        throw new AggregateError(
          [operationError, unlockError],
          "The workflow operation and lock cleanup both failed.",
        );
      }

      if (operationFailed) {
        throw operationError;
      }

      if (unlockError) {
        throw unlockError;
      }

      return operationResult as T;
    } finally {
      client.release(!safeToReuseClient);
    }
  }
}
