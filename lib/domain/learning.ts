export type LearningUser = {
  id: string;
  name: string;
  role: string;
  department: string;
};

export type Course = {
  id: string;
  title: string;
  topic: string;
  level: "beginner" | "intermediate" | "advanced";
  durationHours: number;
};

export type Certification = {
  id: string;
  name: string;
  description: string;
  passingScore: number;
  requiredCourseIds: string[];
};
