// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
  getLearningRuntime: vi.fn(),
}));

vi.mock("@/lib/runtime/learning-runtime", () => ({
  getLearningRuntime: mocks.getLearningRuntime,
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("PERSISTENCE_BACKEND", "memory");
    mocks.checkReadiness.mockResolvedValue(undefined);
    mocks.getLearningRuntime.mockResolvedValue({
      backend: "postgres",
      checkReadiness: mocks.checkReadiness,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.checkReadiness.mockReset();
    mocks.getLearningRuntime.mockReset();
  });

  it("reports the selected backend after readiness succeeds", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      persistence: "postgres",
    });
    expect(mocks.checkReadiness).toHaveBeenCalledOnce();
  });

  it("returns a sanitized unavailable response for an invalid environment", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "not-ready",
    });
    expect(mocks.getLearningRuntime).not.toHaveBeenCalled();
  });

  it("returns a sanitized unavailable response when persistence is not ready", async () => {
    mocks.checkReadiness.mockRejectedValue(
      new Error("postgresql://secret@database/internal"),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"not-ready"}');
    expect(body).not.toContain("secret");
  });
});
