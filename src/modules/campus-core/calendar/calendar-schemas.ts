import { z } from "zod";

const uuid = z.string().uuid();
const optionalBranchId = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  uuid.optional()
);

const calendarFields = z.object({
  institutionId: uuid,
  branchId: optionalBranchId,
  academicYearId: uuid,
  entryType: z.enum(["HOLIDAY", "NON_WORKING_DAY"]).default("HOLIDAY"),
  name: z.string().trim().min(2).max(120),
  description: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(1000).optional()
  ),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  audiences: z.array(z.enum(["STUDENTS", "TEACHING_STAFF", "NON_TEACHING_STAFF"]))
    .min(1, "Select at least one applicable group.")
    .transform((values) => [...new Set(values)])
}).strict();

export const createAcademicCalendarEntrySchema = calendarFields.refine((value) => value.endDate >= value.startDate, {
  message: "End date must be on or after start date.",
  path: ["endDate"]
});

export const updateAcademicCalendarEntrySchema = calendarFields.extend({
  calendarEntryId: uuid
}).strict().refine((value) => value.endDate >= value.startDate, {
  message: "End date must be on or after start date.",
  path: ["endDate"]
});

export const cancelAcademicCalendarEntrySchema = z.object({
  calendarEntryId: uuid,
  cancellationReason: z.string().trim().min(5).max(500)
}).strict();

export type CreateAcademicCalendarEntryInput = z.infer<typeof createAcademicCalendarEntrySchema>;
export type UpdateAcademicCalendarEntryInput = z.infer<typeof updateAcademicCalendarEntrySchema>;
export type CancelAcademicCalendarEntryInput = z.infer<typeof cancelAcademicCalendarEntrySchema>;
