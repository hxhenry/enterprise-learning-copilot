import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { RuntimeStatus } from "@/components/demo/runtime-status";

function healthResponse(
  body: Record<string, unknown>,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("RuntimeStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("announces that readiness is being checked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    render(<RuntimeStatus />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking runtime",
    );
  });

  it.each([
    {
      persistence: "memory" as const,
      label: "Memory · process-local state",
      title: /process-local memory backend is ready/i,
    },
    {
      persistence: "postgres" as const,
      label: "Postgres · durable server state",
      title: /PostgreSQL persistence is ready/i,
    },
  ])(
    "shows the $persistence readiness state",
    async ({ persistence, label, title }) => {
      const fetchMock = vi.fn(async () =>
        healthResponse({ status: "ready", persistence }),
      );
      vi.stubGlobal("fetch", fetchMock);

      render(<RuntimeStatus />);

      await screen.findByText(label);
      const status = screen.getByRole("status");

      expect(status).toHaveTextContent(label);
      expect(status.getAttribute("title")).toMatch(title);
      expect(fetchMock).toHaveBeenCalledWith("/api/health", {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      });
    },
  );

  it.each([
    {
      name: "an unavailable response",
      fetchResult: () =>
        Promise.resolve(
          healthResponse({ status: "not-ready" }, { status: 503 }),
        ),
    },
    {
      name: "an invalid ready response",
      fetchResult: () =>
        Promise.resolve(
          healthResponse({ status: "ready", persistence: "unknown" }),
        ),
    },
    {
      name: "a network failure",
      fetchResult: () => Promise.reject(new Error("network unavailable")),
    },
  ])("reports runtime unavailable after $name", async ({ fetchResult }) => {
    vi.stubGlobal("fetch", vi.fn(fetchResult));

    render(<RuntimeStatus />);

    await screen.findByText("Runtime unavailable");
    const status = screen.getByRole("status");

    expect(status.getAttribute("title")).toContain(
      "Model-provider connectivity is not included",
    );
  });

  it("aborts the readiness request when it unmounts", () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    );

    const { unmount } = render(<RuntimeStatus />);

    expect(requestSignal?.aborted).toBe(false);

    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it("can refresh a stale readiness result", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        healthResponse({ status: "not-ready" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        healthResponse({ status: "ready", persistence: "memory" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<RuntimeStatus />);

    await screen.findByText("Runtime unavailable");
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh runtime readiness" }),
    );

    await screen.findByText("Memory · process-local state");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
