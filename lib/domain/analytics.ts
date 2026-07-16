export type DepartmentCertificationStat = {
  department: string;
  totalEmployees: number;
  completed: number;
  inProgress: number;
  overdue: number;
};

export type DepartmentCertificationResult =
  DepartmentCertificationStat & {
    completionRate: number;
    atRisk: boolean;
  };
