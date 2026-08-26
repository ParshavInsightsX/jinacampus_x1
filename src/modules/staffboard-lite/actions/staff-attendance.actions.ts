"use server";

import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { correctStaffAttendanceSchema } from "@/modules/staffboard-lite/schemas";

export type CorrectStaffAttendanceActionResult =
  | { ok: true; data: never }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

export async function correctStaffAttendanceAction(input: unknown): Promise<CorrectStaffAttendanceActionResult> {
  try {
    correctStaffAttendanceSchema.parse(input);
    await getTenantContext();
    return {
      ok: false,
      code: "ATTENDANCE_CORRECTION_APPROVAL_REQUIRED",
      error: "Submit an attendance correction request for approval."
    };
  } catch (error) {
    return mapActionError(error, {
      fallbackMessage: "Unable to submit an attendance correction.",
      validationMessage: "Use the attendance correction request form."
    });
  }
}