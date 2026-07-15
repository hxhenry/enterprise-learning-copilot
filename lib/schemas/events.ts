export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type AgentEvent =
  | {
      type: "status";
      message: string;
    }
  | {
      type: "tool-start";
      toolName: string;
      message: string;
    }
  | {
      type: "tool-result";
      toolName: string;
      summary: string;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "done";
    }
  | {
      type: "error";
      message: string;
    };

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;

  switch (event.type) {
    case "status":
      return typeof event.message === "string";

    case "tool-start":
      return (
        typeof event.toolName === "string" &&
        typeof event.message === "string"
      );

    case "tool-result":
      return (
        typeof event.toolName === "string" &&
        typeof event.summary === "string"
      );

    case "token":
      return typeof event.content === "string";

    case "done":
      return true;

    case "error":
      return typeof event.message === "string";

    default:
      return false;
  }
}