import { z } from "zod";
import { idSchema, optionalDateSchema, optionalTrimmedString, trimmedString } from "./shared";
import { staffAttendanceDateSchema } from "./staff-attendance.schema";

export const staffAttendanceScanModeSchema = z.enum([
  "AUTO",
  "CHECK_IN",
  "CHECK_OUT",
  "CHECK_IN_ONLY"
]);

export const staffAttendanceCredentialReplacementReasonSchema = z.enum([
  "LOST",
  "DAMAGED",
  "DETAILS_CHANGED",
  "POLICY_REISSUE",
  "OTHER"
]);

export const issueStaffAttendanceCredentialSchema = z.object({
  staffId: idSchema,
  expiresAt: optionalDateSchema,
  reason: optionalTrimmedString(250),
  replacementReason: staffAttendanceCredentialReplacementReasonSchema.optional()
}).strict();

export const staffAttendanceCredentialIdSchema = z.object({
  credentialId: idSchema
}).strict();

export const revokeStaffAttendanceCredentialSchema = z.object({
  credentialId: idSchema,
  reason: trimmedString(5, 500)
}).strict();

export const startStaffAttendanceScanSessionSchema = z.object({
  branchId: idSchema.optional(),
  mode: staffAttendanceScanModeSchema.default("AUTO")
}).strict();

export const closeStaffAttendanceScanSessionSchema = z.object({
  sessionId: idSchema,
  reason: optionalTrimmedString(250)
}).strict();

export const recordSupervisedStaffQrScanSchema = z.object({
  sessionId: idSchema,
  qrPayload: trimmedString(1, 2048),
  clientRequestId: z.string().uuid()
}).strict();

export const staffAttendanceAdjustmentTypeSchema = z.enum([
  "ADD_CHECK_IN",
  "ADD_CHECK_OUT",
  "SET_PRESENT",
  "SET_ABSENT",
  "SET_HALF_DAY",
  "SET_ON_LEAVE",
  "SET_OFFICIAL_DUTY",
  "CORRECT_EVENT_TIME",
  "VOID_EVENT",
  "ADD_NOTE"
]);

export const requestStaffAttendanceAdjustmentSchema = z.object({
  attendanceRecordId: idSchema,
  targetEventId: idSchema.optional(),
  adjustmentType: staffAttendanceAdjustmentTypeSchema,
  occurredAt: optionalDateSchema,
  reasonCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  reasonText: trimmedString(5, 1000)
}).strict().superRefine((value, ctx) => {
  const timeRequired = ["ADD_CHECK_IN", "ADD_CHECK_OUT", "CORRECT_EVENT_TIME"].includes(value.adjustmentType);
  if (timeRequired && !value.occurredAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["occurredAt"], message: "Select the attendance time." });
  }
  const eventRequired = ["CORRECT_EVENT_TIME", "VOID_EVENT"].includes(value.adjustmentType);
  if (eventRequired && !value.targetEventId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetEventId"], message: "Select the attendance event." });
  }
});

export const reviewStaffAttendanceAdjustmentSchema = z.object({
  adjustmentId: idSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
  reviewComment: trimmedString(3, 1000)
}).strict();

export const requestManualStaffAttendanceSchema = z.object({
  branchId: idSchema.optional(),
  staffId: idSchema,
  attendanceDate: staffAttendanceDateSchema,
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "OFFICIAL_DUTY"]),
  checkInAt: optionalDateSchema,
  checkOutAt: optionalDateSchema,
  reasonCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
  reasonText: trimmedString(5, 1000)
}).strict().refine((value) => !value.checkInAt || !value.checkOutAt || value.checkOutAt >= value.checkInAt, {
  path: ["checkOutAt"],
  message: "Check-out time must not be before check-in time."
});

export type IssueStaffAttendanceCredentialInput = z.infer<typeof issueStaffAttendanceCredentialSchema>;
export type RevokeStaffAttendanceCredentialInput = z.infer<typeof revokeStaffAttendanceCredentialSchema>;
export type StaffAttendanceCredentialIdInput = z.infer<typeof staffAttendanceCredentialIdSchema>;
export type StartStaffAttendanceScanSessionInput = z.infer<typeof startStaffAttendanceScanSessionSchema>;
export type RecordSupervisedStaffQrScanInput = z.infer<typeof recordSupervisedStaffQrScanSchema>;
export type RequestStaffAttendanceAdjustmentInput = z.infer<typeof requestStaffAttendanceAdjustmentSchema>;
export type ReviewStaffAttendanceAdjustmentInput = z.infer<typeof reviewStaffAttendanceAdjustmentSchema>;
export type RequestManualStaffAttendanceInput = z.infer<typeof requestManualStaffAttendanceSchema>;