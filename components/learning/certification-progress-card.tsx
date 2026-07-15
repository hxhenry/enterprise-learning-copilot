import type {
  CourseExperienceItem,
  ExperienceBlock,
} from "@/lib/schemas/events";

type CertificationProgressBlock = Extract<
  ExperienceBlock,
  { kind: "certification-progress" }
>;

type CertificationProgressCardProps = {
  block: CertificationProgressBlock;
};

function CourseList({
  title,
  courses,
  emptyMessage,
}: {
  title: string;
  courses: CourseExperienceItem[];
  emptyMessage: string;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>

      {courses.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="rounded-xl bg-slate-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-slate-800">
                {course.title}
              </p>

              <p className="mt-1 text-xs capitalize text-slate-500">
                {course.level} · {course.durationHours} hours
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CertificationProgressCard({
  block,
}: CertificationProgressCardProps) {
  const completedCount = block.completedCourses.length;
  const totalCount =
    completedCount + block.remainingCourses.length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Certification progress
          </p>

          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {block.certificationName}
          </h3>
        </div>

        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
          {block.completionPercent}%
        </span>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            {completedCount} of {totalCount} courses completed
          </span>
          <span>Passing score: {block.passingScore}%</span>
        </div>

        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label={`${block.certificationName} completion`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={block.completionPercent}
        >
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{
              width: `${Math.min(
                100,
                Math.max(0, block.completionPercent),
              )}%`,
            }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <CourseList
          title="Completed"
          courses={block.completedCourses}
          emptyMessage="No required courses completed yet."
        />

        <CourseList
          title="Remaining"
          courses={block.remainingCourses}
          emptyMessage="All required courses are complete."
        />
      </div>
    </section>
  );
}