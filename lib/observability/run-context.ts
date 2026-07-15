import { randomUUID } from "node:crypto";

export type RunOperation =
  | "chat"
  | "approval";

export type RunContext = {
  requestId: string;
  agentRunId: string;
  threadId: string;
  operation: RunOperation;
};

export function createRunContext({
  threadId,
  operation,
}: {
  threadId: string;
  operation: RunOperation;
}): RunContext {
  return {
    requestId: randomUUID(),
    agentRunId: randomUUID(),
    threadId,
    operation,
  };
}