import { performance } from "node:perf_hooks";

import type { RunContext } from "@/lib/observability/run-context";
import {
  logInfo,
  logWarn,
} from "@/lib/observability/logger";
import type { AgentEvent } from "@/lib/schemas/events";

type AgentEventEmitter = (
  event: AgentEvent,
) => unknown;

export function createObservedEventReporter({
  context,
  emit,
}: {
  context: RunContext;
  emit: AgentEventEmitter;
}) {
  const toolStartTimes =
    new Map<string, number[]>();

  return function reportEvent(
    event: AgentEvent,
  ): void {
    switch (event.type) {
      case "agent-selected":
        logInfo(
          "agent.selected",
          context,
          {
            agentId: event.agentId,
            agentName: event.agentName,
            reason: event.reason,
          },
        );
        break;

      case "tool-start": {
        const startTimes =
          toolStartTimes.get(
            event.toolName,
          ) ?? [];

        startTimes.push(
          performance.now(),
        );

        toolStartTimes.set(
          event.toolName,
          startTimes,
        );

        logInfo(
          "agent.tool.started",
          context,
          {
            toolName: event.toolName,
          },
        );
        break;
      }

      case "tool-result": {
        const startTimes =
          toolStartTimes.get(
            event.toolName,
          );

        const startedAt =
          startTimes?.pop();

        if (startTimes?.length === 0) {
          toolStartTimes.delete(
            event.toolName,
          );
        }

        const durationMs =
          startedAt === undefined
            ? undefined
            : Math.round(
                performance.now() -
                  startedAt,
              );

        logInfo(
          "agent.tool.completed",
          context,
          {
            toolName: event.toolName,
            durationMs,
            summary: event.summary,
          },
        );
        break;
      }

      case "experience":
        logInfo(
          "experience.block.emitted",
          context,
          {
            blockId: event.block.id,
            blockKind:
              event.block.kind,
          },
        );
        break;

      case "approval-required":
        logInfo(
          "workflow.approval.required",
          context,
          {
            actionId:
              event.request.actionId,
            actionType:
              event.request.actionType,
            courseId:
              event.request.courseId,
          },
        );
        break;

      case "approval-resolved":
        logInfo(
          "workflow.approval.resolved",
          context,
          {
            actionId: event.actionId,
            approved: event.approved,
          },
        );
        break;

      case "error":
        logWarn(
          "workflow.client_error.emitted",
          context,
          {
            message: event.message,
          },
        );
        break;

      default:
        break;
    }

    emit(event);
  };
}