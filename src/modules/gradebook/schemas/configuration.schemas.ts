import { z } from "zod";
import { codeSchema, dateSchema, idSchema, optionalDateSchema, optionalIdSchema, optionalTrimmedString, trimmedString } from "@/modules/academia/schemas/shared";

const positiveDecimal = z.coerce.number().finite().positive().max(100000);
const nonNegativeDecimal = z.coerce.number().finite().min(0).max(100000);

export const createAssessmentSchemeSchema = z.object({
  code: codeSchema,
  name: trimmedString(2, 120),
  description: optionalTrimmedString(1000),
  configuration: z.record(z.unknown()).default({})
}).strict();

export const createExamTermSchema = z.object({
  schemeVersionId: optionalIdSchema,
  code: codeSchema,
  name: trimmedString(2, 120),
  displayName: optionalTrimmedString(120),
  sequence: z.coerce.number().int().min(1).max(100),
  startDate: dateSchema,
  endDate: dateSchema,
  resultPublicationStartAt: optionalDateSchema,
  isReportCardTerm: z.boolean().default(true),
  allowDateOverlap: z.boolean().default(false)
}).strict().refine((value) => value.endDate >= value.startDate, {
  message: "Term end date must be on or after its start date.",
  path: ["endDate"]
});

export const createExamTypeSchema = z.object({
  code: codeSchema,
  name: trimmedString(2, 120),
  category: z.enum(["WRITTEN", "PRACTICAL", "ORAL", "PROJECT", "INTERNAL", "FORMATIVE", "SUMMATIVE", "OTHER"]),
  defaultMaximumMarks: positiveDecimal.optional(),
  defaultPassingMarks: nonNegativeDecimal.optional(),
  defaultWeightagePercent: z.coerce.number().finite().min(0).max(100).optional(),
  allowsSpecialStatuses: z.boolean().default(true),
  requiresSchedule: z.boolean().default(true),
  requiresRoom: z.boolean().default(false)
}).strict().refine(
  (value) => value.defaultMaximumMarks === undefined || value.defaultPassingMarks === undefined || value.defaultPassingMarks <= value.defaultMaximumMarks,
  { message: "Default passing marks cannot exceed maximum marks.", path: ["defaultPassingMarks"] }
);

export const gradeRuleSchema = z.object({
  minimumInclusive: z.coerce.number().finite().min(0).max(100000),
  maximumInclusive: z.coerce.number().finite().min(0).max(100000),
  letterGrade: z.string().trim().min(1).max(12),
  gradePoint: z.coerce.number().finite().min(0).max(100).optional(),
  remarkTemplate: optionalTrimmedString(200),
  isPassing: z.boolean(),
  displayOrder: z.coerce.number().int().min(0).max(100)
}).strict().refine((value) => value.minimumInclusive <= value.maximumInclusive, {
  message: "The grade range minimum cannot exceed its maximum.",
  path: ["maximumInclusive"]
});

export const createGradeScaleSchema = z.object({
  code: codeSchema,
  name: trimmedString(2, 120),
  description: optionalTrimmedString(1000),
  academicYearId: optionalIdSchema,
  scoreBasis: z.enum(["PERCENTAGE", "WEIGHTED_PERCENTAGE", "RAW_SCORE", "GRADE_ONLY"]).default("PERCENTAGE"),
  roundingMode: z.enum(["HALF_UP", "HALF_EVEN", "FLOOR", "CEILING"]).default("HALF_UP"),
  decimalPlaces: z.coerce.number().int().min(0).max(4).default(2),
  rules: z.array(gradeRuleSchema).min(1).max(50)
}).strict();

export const createCalculationRuleSetSchema = z.object({
  code: codeSchema,
  name: trimmedString(2, 120),
  description: optionalTrimmedString(1000),
  academicYearId: optionalIdSchema,
  strategy: z.enum(["SUM_COMPONENTS_RAW", "WEIGHTED_COMPONENTS", "SCALE_TO_MAXIMUM"]),
  rules: z.object({
    requireAllSubjectsPassing: z.boolean().default(true),
    minimumOverallPercentage: z.coerce.number().finite().min(0).max(100).optional(),
    allowPendingResults: z.boolean().default(false),
    specialStatusTreatment: z.record(z.enum(["EXCLUDE", "PENDING", "FAIL", "NO_DENOMINATOR"])).default({})
  }).strict()
}).strict();

export const gradebookConfigurationIdSchema = z.object({ id: idSchema }).strict();

export const transitionExamTypeSchema = z.object({
  examTypeId: idSchema,
  action: z.enum(["ACTIVATE", "ARCHIVE"]),
  expectedVersion: z.coerce.number().int().positive()
}).strict();

export const transitionExamTermSchema = z.object({
  termId: idSchema,
  action: z.enum(["ACTIVATE", "CLOSE", "ARCHIVE"]),
  expectedVersion: z.coerce.number().int().positive()
}).strict();

export type CreateAssessmentSchemeInput = z.infer<typeof createAssessmentSchemeSchema>;
export type CreateExamTermInput = z.infer<typeof createExamTermSchema>;
export type CreateExamTypeInput = z.infer<typeof createExamTypeSchema>;
export type CreateGradeScaleInput = z.infer<typeof createGradeScaleSchema>;
export type CreateCalculationRuleSetInput = z.infer<typeof createCalculationRuleSetSchema>;
