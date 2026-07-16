import { describe, expect, it } from "vitest";

import {
  WorkflowLockReleaseError,
  WorkflowLockTimeoutError,
} from "@/lib/concurrency/workflow-execution-coordinator";
import {
  isPersistenceError,
  isRetryablePersistenceError,
} from "@/lib/database/persistence-error";
import { PersistenceOperationError } from "@/lib/database/errors";
import { PostgresReadinessError } from "@/lib/database/postgres";

describe("persistence error classification", () => {
  it.each([
    new WorkflowLockTimeoutError(),
    new WorkflowLockReleaseError(),
    new PersistenceOperationError(
      Object.assign(new Error("connection refused"), {
        code: "ECONNREFUSED",
      }),
    ),
    new PersistenceOperationError(
      Object.assign(new Error("connection failure"), {
        code: "08006",
      }),
    ),
    new PersistenceOperationError(
      Object.assign(new Error("database is starting"), {
        code: "57P03",
      }),
    ),
    new PersistenceOperationError(
      new Error("timeout exceeded when trying to connect"),
    ),
    new PersistenceOperationError(
      new Error("Connection terminated due to connection timeout"),
    ),
    new PersistenceOperationError(new Error("Query read timeout")),
    new PersistenceOperationError(
      new Error("Connection terminated unexpectedly"),
    ),
    new PersistenceOperationError(
      Object.assign(new Error("serialization failure"), {
        code: "40001",
      }),
    ),
    new PersistenceOperationError(
      new Error("outer database error", {
        cause: Object.assign(new Error("connection reset"), {
          code: "ECONNRESET",
        }),
      }),
    ),
  ])("recognizes a retryable persistence failure", (error) => {
    expect(isRetryablePersistenceError(error)).toBe(true);
  });

  it("recognizes a retryable child inside an aggregate failure", () => {
    expect(
      isRetryablePersistenceError(
        new AggregateError([
          new Error("workflow failed"),
          new WorkflowLockReleaseError(),
        ]),
      ),
    ).toBe(true);
  });

  it.each([
    new Error("model failed"),
    Object.assign(new Error("provider connection failed"), {
      code: "ECONNRESET",
    }),
    Object.assign(new Error("provider timed out"), {
      code: "ETIMEDOUT",
    }),
    Object.assign(new Error("unique violation"), { code: "23505" }),
    null,
  ])("does not misclassify a permanent or unrelated failure", (error) => {
    expect(isRetryablePersistenceError(error)).toBe(false);
  });

  it("recognizes an unmigrated schema as a permanent persistence failure", () => {
    const error = new PostgresReadinessError(["checkpoints"]);

    expect(isPersistenceError(error)).toBe(true);
    expect(isRetryablePersistenceError(error)).toBe(false);
  });
});
