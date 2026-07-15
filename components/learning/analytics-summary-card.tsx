import type { ExperienceBlock } from "@/lib/schemas/events";

type AnalyticsSummaryBlock = Extract<
  ExperienceBlock,
  { kind: "analytics-summary" }
>;

type AnalyticsSummaryCardProps = {
  block: AnalyticsSummaryBlock;
};

export function AnalyticsSummaryCard({
  block,
}: AnalyticsSummaryCardProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
          Business analytics
        </p>

        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {block.title}
          </h3>

          {block.highestRiskDepartment ? (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
              Highest risk: {block.highestRiskDepartment}
            </span>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Department</th>
              <th className="px-5 py-3">Completion</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3">In progress</th>
              <th className="px-5 py-3">Overdue</th>
              <th className="px-5 py-3">Risk</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {block.statistics.map((statistic) => (
              <tr key={statistic.department}>
                <td className="px-5 py-4 font-medium text-slate-800">
                  {statistic.department}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {statistic.completionRate}%
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {statistic.completed}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {statistic.inProgress}
                </td>

                <td className="px-5 py-4 text-slate-600">
                  {statistic.overdue}
                </td>

                <td className="px-5 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      statistic.atRisk
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {statistic.atRisk ? "At risk" : "On track"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}