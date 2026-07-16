import { createHash } from "node:crypto";

import { parseSafeIdentifier } from "@/lib/security/request-validation";

declare const checkpointThreadIdBrand: unique symbol;

export type CheckpointThreadId = string & {
  readonly [checkpointThreadIdBrand]: true;
};

function requireSafeIdentifier(value: string): string {
  const identifier = parseSafeIdentifier(value);

  if (!identifier) {
    throw new Error("A safe checkpoint identifier is required.");
  }

  return identifier;
}

export function createCheckpointThreadId(
  actorId: string,
  clientThreadId: string,
): CheckpointThreadId {
  const safeActorId = requireSafeIdentifier(actorId);
  const safeClientThreadId = requireSafeIdentifier(clientThreadId);
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "enterprise-learning-copilot/checkpoint/v1",
        safeActorId,
        safeClientThreadId,
      ]),
      "utf8",
    )
    .digest("hex");

  return `checkpoint:v1:${digest}` as CheckpointThreadId;
}

export function createWorkflowLockKey(
  checkpointThreadId: CheckpointThreadId,
): string {
  return `workflow:v1:${checkpointThreadId}`;
}
