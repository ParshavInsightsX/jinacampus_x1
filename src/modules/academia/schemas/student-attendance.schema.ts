import { z } from "zod";
import {
  idSchema,
  optionalDateSchema,
  optionalTrimmedString,
  paginationFields,
  trimmedString
} from "./shared";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeAttendanceDate(value: unknown) {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (!dateOnlyPattern.test(trimmed)) return trimmed;

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidDateOnly =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isValidDateOnly ? date : new Date(Number.NaN);
}

function uniqueStudentEntries(value: { entries: Array<{ studentId: string }> }) {
  return new Set(value.entries.map((entry) => entry.studentId)).size === value.entries.length;
}

function dateRangeIsValid(value: { fromDate?: Date; toDate?: Date }) {
  if (!value.fromDate || !value.toDate) return true;
  return value.toDate >= value.fromDate;
}

export const attendanceDateSchema = z.preprocess(
  normalizeAttendanceDate,
  z.coerce.date().refine((date) => !Number.isNaN(date.getTime()), {
    message: "Invalid attendance date"
  })
);

export const attendanceSessionTypeSchema = z.literal("FULL_DAY").default("FULL_DAY");

export const studentAttendanceStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "EXCUSED"
]);

export const studentAttendanceReportStatusSchema = z.enum([
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "EXCUSED",
  "NOT_MARKED"
]);

export const absentStudentReportStatusSchema = z.enum(["ABSENT", "LATE", "HALF_DAY"]).default("ABSENT");

export const activeEnrolledStudentsForAttendanceSchema = z.object({
  classSectionId: idSchema,
  attendanceDate: attendanceDateSchema.optional()
}).strict();

export const submitStudentAttendanceEntrySchema = z.object({
  studentId: idSchema,
  status: studentAttendanceStatusSchema,
  remarks: optionalTrimmedString(300)
}).strict();

export const submitStudentAttendanceSchema = z.object({
  classSectionId: idSchema,
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema,
  entries: z.array(submitStudentAttendanceEntrySchema).min(1, "At least one attendance entry is required")
}).strict().refine(uniqueStudentEntries, {
  message: "Each student can appear only once in an attendance submission",
  path: ["entries"]
});

export const correctStudentAttendanceSchema = z.object({
  attendanceRecordId: idSchema,
  status: studentAttendanceStatusSchema,
  correctionReason: trimmedString(5, 500),
  remarks: optionalTrimmedString(300)
}).strict();

export const lockStudentAttendanceSchema = z.object({
  classSectionId: idSchema,
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema,
  lockReason: optionalTrimmedString(300)
}).strict();

export const autoLockStudentAttendanceSchema = z.object({
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema,
  classSectionId: idSchema.optional()
}).strict();

export const studentAttendanceReportFilterSchema = z.object({
  classSectionId: idSchema.optional(),
  studentId: idSchema.optional(),
  fromDate: optionalDateSchema,
  toDate: optionalDateSchema,
  status: studentAttendanceReportStatusSchema.optional(),
  sessionType: attendanceSessionTypeSchema.optional(),
  ...paginationFields
}).strict().refine(dateRangeIsValid, {
  message: "To date must not be before from date",
  path: ["toDate"]
});

export const dailyAttendanceReportFilterSchema = z.object({
  attendanceDate: attendanceDateSchema,
  classSectionId: idSchema.optional(),
  status: studentAttendanceReportStatusSchema.optional()
}).strict();

export const absentStudentsReportFilterSchema = z.object({
  attendanceDate: attendanceDateSchema,
  classSectionId: idSchema.optional(),
  status: absentStudentReportStatusSchema
}).strict();

export const lateStudentsReportFilterSchema = z.object({
  attendanceDate: attendanceDateSchema,
  classSectionId: idSchema.optional()
}).strict();

export const studentAttendanceHistoryFilterSchema = z.object({
  studentId: idSchema.optional(),
  fromDate: attendanceDateSchema,
  toDate: attendanceDateSchema
}).strict().refine(dateRangeIsValid, {
  message: "To date must not be before from date",
  path: ["toDate"]
});

export const classSectionsNotMarkedReportFilterSchema = z.object({
  attendanceDate: attendanceDateSchema,
  classSectionId: idSchema.optional()
}).strict();

export const monthlyAttendancePercentageFilterSchema = z.object({
  classSectionId: idSchema.optional(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
}).strict();

export const studentAttendanceCaptureStatusSchema = z.enum(["PRESENT", "ABSENT", "LEAVE"]);

export const prepareStudentAttendanceSessionSchema = z.object({
  classSectionId: idSchema,
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema,
  delegationReason: optionalTrimmedString(500)
}).strict();

export const mutateStudentAttendanceEntrySchema = z.object({
  sessionId: idSchema,
  entryId: idSchema,
  status: studentAttendanceCaptureStatusSchema,
  clientMutationId: idSchema,
  baseRecordVersion: z.coerce.number().int().min(0),
  capturedAtClient: z.string().datetime({ offset: true }).optional()
}).strict();

export const correctStudentAttendanceSessionEntrySchema = z.object({
  sessionId: idSchema,
  entryId: idSchema,
  status: studentAttendanceStatusSchema,
  correctionReason: trimmedString(5, 500),
  remarks: optionalTrimmedString(300)
}).strict();

export const markRemainingStudentsPresentSchema = z.object({
  sessionId: idSchema,
  clientMutationId: idSchema,
  baseSessionVersion: z.coerce.number().int().min(0)
}).strict();

export const undoStudentAttendanceBulkSchema = z.object({
  sessionId: idSchema,
  targetBulkMutationId: idSchema,
  clientMutationId: idSchema,
  baseSessionVersion: z.coerce.number().int().min(0)
}).strict();

export const completeStudentAttendanceSessionSchema = z.object({
  sessionId: idSchema,
  expectedSessionVersion: z.coerce.number().int().min(0)
}).strict();
export const attendanceFilterSchema = studentAttendanceReportFilterSchema;
export const listStudentAttendanceSchema = studentAttendanceReportFilterSchema;

export type StudentAttendanceCaptureStatusInput = z.infer<typeof studentAttendanceCaptureStatusSchema>;
export type PrepareStudentAttendanceSessionInput = z.infer<typeof prepareStudentAttendanceSessionSchema>;
export type MutateStudentAttendanceEntryInput = z.infer<typeof mutateStudentAttendanceEntrySchema>;
export type CorrectStudentAttendanceSessionEntryInput = z.infer<typeof correctStudentAttendanceSessionEntrySchema>;
export type MarkRemainingStudentsPresentInput = z.infer<typeof markRemainingStudentsPresentSchema>;
export type UndoStudentAttendanceBulkInput = z.infer<typeof undoStudentAttendanceBulkSchema>;
export type CompleteStudentAttendanceSessionInput = z.infer<typeof completeStudentAttendanceSessionSchema>;
export type SubmitStudentAttendanceEntryInput = z.infer<typeof submitStudentAttendanceEntrySchema>;
export type SubmitStudentAttendanceInput = z.infer<typeof submitStudentAttendanceSchema>;
export type CorrectStudentAttendanceInput = z.infer<typeof correctStudentAttendanceSchema>;
export type LockStudentAttendanceInput = z.infer<typeof lockStudentAttendanceSchema>;
export type AutoLockStudentAttendanceInput = z.infer<typeof autoLockStudentAttendanceSchema>;
export type StudentAttendanceFilterInput = z.infer<typeof studentAttendanceReportFilterSchema>;
export type ActiveEnrolledStudentsForAttendanceInput = z.infer<typeof activeEnrolledStudentsForAttendanceSchema>;
export type DailyAttendanceReportFilterInput = z.infer<typeof dailyAttendanceReportFilterSchema>;
export type AbsentStudentsReportFilterInput = z.infer<typeof absentStudentsReportFilterSchema>;
export type LateStudentsReportFilterInput = z.infer<typeof lateStudentsReportFilterSchema>;
export type StudentAttendanceHistoryFilterInput = z.infer<typeof studentAttendanceHistoryFilterSchema>;
export type ClassSectionsNotMarkedReportFilterInput = z.infer<typeof classSectionsNotMarkedReportFilterSchema>;
export type MonthlyAttendancePercentageFilterInput = z.infer<typeof monthlyAttendancePercentageFilterSchema>;
