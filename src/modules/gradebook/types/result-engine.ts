import type {
  GradebookCalculationStrategy,
  GradebookRoundingMode,
  GradebookSpecialExamStatus
} from "@prisma/client";

export type GradeRuleInput = {
  minimumInclusive: string;
  maximumInclusive: string;
  letterGrade: string;
  gradePoint: string | null;
  isPassing: boolean;
};

export type ResultComponentInput = {
  componentId: string;
  maximumMarks: string;
  passingMarks: string | null;
  weightagePercent: string | null;
  marksObtained: string | null;
  specialStatus: GradebookSpecialExamStatus | null;
};

export type SubjectCalculationInput = {
  examSubjectId: string;
  maximumMarks: string;
  passingMarks: string | null;
  components: ResultComponentInput[];
};

export type ResultEnginePolicy = {
  strategy: GradebookCalculationStrategy;
  roundingMode: GradebookRoundingMode;
  decimalPlaces: number;
  requireAllSubjectsPassing: boolean;
  minimumOverallPercentage?: number;
  allowPendingResults: boolean;
  specialStatusTreatment: Partial<Record<GradebookSpecialExamStatus, "EXCLUDE" | "PENDING" | "FAIL" | "NO_DENOMINATOR">>;
};
