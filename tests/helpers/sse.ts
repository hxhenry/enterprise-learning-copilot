import {
  isAgentEvent,
  type AgentEvent,
} from "@/lib/schemas/events";
import { getAgentEventData } from "@/lib/streaming/agent-event-stream";

export async function readAgentEvents(
  response: Response,
): Promise<AgentEvent[]> {
  const body = await response.text();

  return body
    .split("\n\n")
    .map((block) => getAgentEventData(block))
    .filter((data): data is string => data !== null)
    .map((data) => {
      const parsed: unknown = JSON.parse(data);

      if (!isAgentEvent(parsed)) {
        throw new Error("The response contained an invalid agent event.");
      }

      return parsed;
    });
}
