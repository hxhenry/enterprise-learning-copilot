import type { RunContext } from "@/lib/observability/run-context";

type LogLevel =
  | "info"
  | "warn"
  | "error";

type LogFields = Record<string, unknown>;

function writeLog(
  level: LogLevel,
  event: string,
  context: RunContext,
  fields: LogFields = {},
): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
    requestId: context.requestId,
    agentRunId: context.agentRunId,
    threadId: context.threadId,
    operation: context.operation,
  };

  const serializedPayload =
    JSON.stringify(payload);

  switch (level) {
    case "info":
      console.info(serializedPayload);
      break;

    case "warn":
      console.warn(serializedPayload);
      break;

    case "error":
      console.error(serializedPayload);
      break;
  }
}

export function logInfo(
  event: string,
  context: RunContext,
  fields: LogFields = {},
): void {
  writeLog(
    "info",
    event,
    context,
    fields,
  );
}

export function logWarn(
  event: string,
  context: RunContext,
  fields: LogFields = {},
): void {
  writeLog(
    "warn",
    event,
    context,
    fields,
  );
}

export function logError(
  event: string,
  context: RunContext,
  error: unknown,
  fields: LogFields = {},
): void {
  const errorDetails =
    error instanceof Error
      ? {
          errorName: error.name,
          errorMessage: error.message,
          errorStack:
            process.env.NODE_ENV ===
            "development"
              ? error.stack
              : undefined,
        }
      : {
          errorName: "UnknownError",
          errorMessage:
            "An unknown error occurred.",
        };

  writeLog("error", event, context, {
    ...fields,
    ...errorDetails,
  });
}