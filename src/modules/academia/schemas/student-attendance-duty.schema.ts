import { z } from "zod";
import { attendanceDateSchema, attendanceSessionTypeSchema } from "./student-attendance.schema";
import { idSchema, optionalTrimmedString, trimmedString } from "./shared";

export const studentAttendanceDutyAssignmentTypeSchema = z.enum([
  "CO_CLASS_TEACHER",
  "SUBSTITUTE_TEACHER",
  "PERIOD_TEACHER",
  "ATTENDANCE_OPERATOR"
]);

export const studentAttendanceDutySourceTypeSchema = z.enum([
  "MANUAL",
  "STAFF_LEAVE",
  "TIMETABLE",
  "SYSTEM_ESCALATION"
]);

export const createStudentAttendanceDutyAssignmentSchema = z.object({
  classSectionId: idSchema,
  assignedUserId: idSchema,
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema,
  assignmentType: studentAttendanceDutyAssignmentTypeSchema,
  reasonCode: z.string().trim().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  reasonText: trimmedString(5, 500),
  sourceType: studentAttendanceDutySourceTypeSchema.default("MANUAL"),
  sourceEntityId: optionalTrimmedString(160),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  replaceExisting: z.boolean().default(false)
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.startsAt) !== Boolean(value.expiresAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "Provide both the start and end time, or leave both blank."
    });
  }
  if (value.startsAt && value.expiresAt && value.expiresAt <= value.startsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "The duty end time must be later than the start time."
    });
  }
});

export const studentAttendanceDutyIdSchema = z.object({
  assignmentId: idSchema
}).strict();

export const declineStudentAttendanceDutySchema = z.object({
  assignmentId: idSchema,
  reason: trimmedString(5, 300)
}).strict();

export const revokeStudentAttendanceDutySchema = z.object({
  assignmentId: idSchema,
  reason: trimmedString(5, 300)
}).strict();

export const studentAttendanceCoverageFilterSchema = z.object({
  attendanceDate: attendanceDateSchema,
  sessionType: attendanceSessionTypeSchema
}).strict();

export type CreateStudentAttendanceDutyAssignmentInput = z.infer<
  typeof createStudentAttendanceDutyAssignmentSchema
>;
export type StudentAttendanceDutyIdInput = z.infer<typeof studentAttendanceDutyIdSchema>;
export type DeclineStudentAttendanceDutyInput = z.infer<typeof declineStudentAttendanceDutySchema>;
export type RevokeStudentAttendanceDutyInput = z.infer<typeof revokeStudentAttendanceDutySchema>;
export type StudentAttendanceCoverageFilterInput = z.infer<typeof studentAttendanceCoverageFilterSchema>;
