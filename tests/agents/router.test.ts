// @vitest-environment node

import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { routeLearningRequest } from "@/lib/agents/router";
import type { AgentId } from "@/lib/agents/registry";
import type { ConversationTurn } from "@/lib/agents/state";

const usage: LanguageModelV4Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: 0,
  },
};

function createModel(output: unknown) {
  const result: LanguageModelV4GenerateResult = {
    content: [
      {
        type: "text",
        text: JSON.stringify(output),
      },
    ],
    finishReason: {
      unified: "stop",
      raw: "stop",
    },
    usage,
    warnings: [],
  };

  return new MockLanguageModelV4({
    doGenerate: result,
  });
}

describe("learning request router", () => {
  it.each<{
    agentId: AgentId;
    requestKind: "answer" | "enrollment";
  }>([
    { agentId: "tutor", requestKind: "answer" },
    { agentId: "certification", requestKind: "answer" },
    { agentId: "analytics", requestKind: "answer" },
    { agentId: "certification", requestKind: "enrollment" },
  ])(
    "returns a validated $agentId/$requestKind decision",
    async ({ agentId, requestKind }) => {
      const model = createModel({
        agentId,
        requestKind,
        reason: `Route to ${agentId}.`,
      });
      const abortController = new AbortController();

      const decision = await routeLearningRequest(
        "Current request",
        [{ role: "user", content: "Current request" }],
        abortController.signal,
        model,
      );

      expect(decision).toEqual({
        agentId,
        requestKind,
        reason: `Route to ${agentId}.`,
      });
      const forwardedSignal = model.doGenerateCalls[0]?.abortSignal;

      expect(forwardedSignal?.aborted).toBe(false);
      abortController.abort();
      expect(forwardedSignal?.aborted).toBe(true);
    },
  );

  it("limits router context to six prior turns", async () => {
    const model = createModel({
      agentId: "tutor",
      requestKind: "answer",
      reason: "A follow-up course question.",
    });
    const conversation: ConversationTurn[] = [
      { role: "user", content: "old-turn-1" },
      { role: "assistant", content: "old-turn-2" },
      { role: "user", content: "recent-turn-1" },
      { role: "assistant", content: "recent-turn-2" },
      { role: "user", content: "recent-turn-3" },
      { role: "assistant", content: "recent-turn-4" },
      { role: "user", content: "recent-turn-5" },
      { role: "assistant", content: "recent-turn-6" },
      { role: "user", content: "current-turn" },
    ];

    await routeLearningRequest(
      "current-turn",
      conversation,
      new AbortController().signal,
      model,
    );

    const serializedPrompt = JSON.stringify(
      model.doGenerateCalls[0]?.prompt,
    );

    expect(serializedPrompt).not.toContain("old-turn-1");
    expect(serializedPrompt).not.toContain("old-turn-2");
    expect(serializedPrompt).toContain("recent-turn-1");
    expect(serializedPrompt).toContain("recent-turn-6");
    expect(serializedPrompt.match(/current-turn/g)).toHaveLength(1);
  });

  it("rejects output outside the registered agent contract", async () => {
    const model = createModel({
      agentId: "untrusted-agent",
      requestKind: "answer",
      reason: "Invalid route.",
    });

    await expect(
      routeLearningRequest(
        "Current request",
        [{ role: "user", content: "Current request" }],
        new AbortController().signal,
        model,
      ),
    ).rejects.toThrow();
  });
});
