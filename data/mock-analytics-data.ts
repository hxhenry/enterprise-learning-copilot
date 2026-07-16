import type {
  DepartmentCertificationResult,
  DepartmentCertificationStat,
} from "@/lib/domain/analytics";

export type {
  DepartmentCertificationResult,
  DepartmentCertificationStat,
} from "@/lib/domain/analytics";

const departmentStats: DepartmentCertificationStat[] = [
  {
    department: "Engineering",
    totalEmployees: 120,
    completed: 84,
    inProgress: 24,
    overdue: 12,
  },
  {
    department: "Finance",
    totalEmployees: 80,
    completed: 68,
    inProgress: 8,
    overdue: 4,
  },
  {
    department: "Operations",
    totalEmployees: 100,
    completed: 61,
    inProgress: 21,
    overdue: 18,
  },
  {
    department: "Sales",
    totalEmployees: 90,
    completed: 72,
    inProgress: 12,
    overdue: 6,
  },
];

export function getCertificationStats(
  department?: string,
): DepartmentCertificationResult[] {
  const normalizedDepartment =
    department?.trim().toLowerCase();

  const matchingStats = normalizedDepartment
    ? departmentStats.filter(
        (stat) =>
          stat.department.toLowerCase() ===
          normalizedDepartment,
      )
    : departmentStats;

  return matchingStats.map((stat) => {
    const completionRate = Math.round(
      (stat.completed / stat.totalEmployees) * 100,
    );

    return {
      ...stat,
      completionRate,
      atRisk:
        completionRate < 75 || stat.overdue >= 10,
    };
  });
}
