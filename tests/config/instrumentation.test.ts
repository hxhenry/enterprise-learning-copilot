// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { register } from "@/instrumentation";

describe("Next.js server instrumentation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates model configuration for the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    await expect(register()).resolves.toBeUndefined();
  });

  it("fails before the Node.js server accepts requests when configuration is missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(register()).rejects.toThrow("Invalid server environment");
  });

  it("does not load Node-only configuration in another runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(register()).resolves.toBeUndefined();
  });
});
