import type {
  AgentActivity,
  AgentActivityStatus,
} from "@/lib/schemas/events";

type AgentActivityTimelineProps = {
  activities: AgentActivity[];
};

function formatName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function getStatusLabel(status: AgentActivityStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
  }
}

function getStatusClasses(
  status: AgentActivityStatus,
): string {
  switch (status) {
    case "running":
      return "bg-blue-100 text-blue-700";
    case "completed":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-red-100 text-red-700";
    case "stopped":
      return "bg-amber-100 text-amber-700";
  }
}

function getKindLabel(kind: AgentActivity["kind"]): string {
  switch (kind) {
    case "agent":
      return "Route";
    case "tool":
      return "Tool";
    case "approval":
      return "Approval";
  }
}

export function AgentActivityTimeline({
  activities,
}: AgentActivityTimelineProps) {
  if (activities.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Workflow trace"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Workflow trace
        </h3>

        <p className="text-xs text-slate-500">
          Route, tools, and approval boundary
        </p>
      </div>

      <ol className="mt-3 space-y-3">
        {activities.map((activity) => (
          <li
            key={activity.id}
            className="flex items-start gap-3"
          >
            <span
              className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getStatusClasses(
                activity.status,
              )}`}
              aria-hidden="true"
            >
              {activity.status === "running"
                ? "•"
                : activity.status === "completed"
                  ? "✓"
                  : "!"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-600">
                  {getKindLabel(activity.kind)}
                </span>

                <p className="text-sm font-medium text-slate-800">
                  {formatName(activity.name)}
                </p>

                <span className="text-xs font-medium text-slate-500">
                  {getStatusLabel(activity.status)}
                </span>
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                {activity.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
