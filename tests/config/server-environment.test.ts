import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_OPENAI_MODEL,
  parseServerEnvironment,
  ServerEnvironmentError,
} from "@/lib/config/server-environment";

describe("server environment", () => {
  it("applies model defaults", () => {
    expect(
      parseServerEnvironment({
        OPENAI_API_KEY: "test-key",
      }),
    ).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: DEFAULT_OPENAI_MODEL,
      OPENAI_EMBEDDING_MODEL: DEFAULT_OPENAI_EMBEDDING_MODEL,
    });
  });

  it("trims explicit configuration", () => {
    expect(
      parseServerEnvironment({
        OPENAI_API_KEY: "  test-key  ",
        OPENAI_MODEL: "  test-model  ",
        OPENAI_EMBEDDING_MODEL: "  test-embedding  ",
      }),
    ).toEqual({
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "test-model",
      OPENAI_EMBEDDING_MODEL: "test-embedding",
    });
  });

  it.each([undefined, "", "   "])(
    "rejects a missing API key without exposing secrets: %s",
    (apiKey) => {
      expect(() =>
        parseServerEnvironment({
          OPENAI_API_KEY: apiKey,
        }),
      ).toThrow(ServerEnvironmentError);

      try {
        parseServerEnvironment({
          OPENAI_API_KEY: apiKey,
          OTHER_SECRET: "test-secret",
        });
      } catch (error) {
        expect(String(error)).not.toContain("test-secret");
      }
    },
  );
});
