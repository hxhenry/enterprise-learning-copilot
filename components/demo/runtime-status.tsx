"use client";

import { useEffect, useState } from "react";

type RuntimeState =
  | { status: "checking" }
  | { status: "ready"; persistence: "memory" | "postgres" }
  | { status: "unavailable" };

type HealthResponse = {
  status?: unknown;
  persistence?: unknown;
};

export function RuntimeStatus() {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    status: "checking",
  });
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();

    async function checkRuntime() {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: abortController.signal,
        });
        const body = (await response.json()) as HealthResponse;

        if (
          response.ok &&
          body.status === "ready" &&
          (body.persistence === "memory" || body.persistence === "postgres")
        ) {
          setRuntimeState({
            status: "ready",
            persistence: body.persistence,
          });
          return;
        }

        setRuntimeState({ status: "unavailable" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRuntimeState({ status: "unavailable" });
      }
    }

    void checkRuntime();

    return () => abortController.abort();
  }, [refreshVersion]);

  function refreshRuntime() {
    setRuntimeState({ status: "checking" });
    setRefreshVersion((currentVersion) => currentVersion + 1);
  }

  const refreshButton = (
    <button
      type="button"
      aria-label="Refresh runtime readiness"
      title="Refresh runtime readiness"
      disabled={runtimeState.status === "checking"}
      onClick={refreshRuntime}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-50"
    >
      <span aria-hidden="true">↻</span>
    </button>
  );

  if (runtimeState.status === "checking") {
    return (
      <div className="flex items-center gap-1.5">
        <span
          role="status"
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 animate-pulse rounded-full bg-slate-400"
          />
          Checking runtime
        </span>

        {refreshButton}
      </div>
    );
  }

  if (runtimeState.status === "unavailable") {
    return (
      <div className="flex items-center gap-1.5">
        <span
          role="status"
          title="Configuration or persistence readiness failed. Model-provider connectivity is not included in this check."
          className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-red-500"
          />
          Runtime unavailable
        </span>

        {refreshButton}
      </div>
    );
  }

  const isDurable = runtimeState.persistence === "postgres";

  return (
    <div className="flex items-center gap-1.5">
      <span
        role="status"
        title={
          isDurable
            ? "PostgreSQL persistence is ready. Server checkpoints and enrollment writes are durable; the browser transcript is page-local."
            : "The process-local memory backend is ready. Restarting the server resets workflow state."
        }
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
          isDurable
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            isDurable ? "bg-emerald-500" : "bg-amber-500"
          }`}
        />
        {isDurable
          ? "Postgres · durable server state"
          : "Memory · process-local state"}
      </span>

      {refreshButton}
    </div>
  );
}
