"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  acknowledgeStudentAttendanceDuty,
  createStudentAttendanceDutyAssignment,
  declineStudentAttendanceDuty,
  revokeStudentAttendanceDuty
} from "@/modules/academia/services/student-attendance-duty.service";

export type AttendanceDutyActionState = {
  ok: boolean;
  message: string | null;
};


function refreshAttendanceCoverage() {
  revalidatePath("/academia/attendance");
  revalidatePath("/academia/attendance/coverage");
  revalidatePath("/academia/attendance/mark");
}

function safeActionError(error: unknown): AttendanceDutyActionState {
  const result = mapActionError(error, {
    fallbackMessage: "The attendance duty could not be updated. Please try again.",
    validationMessage: "Check the duty details and try again."
  });
  return { ok: false, message: result.error };
}

function optionalValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

export async function createStudentAttendanceDutyAssignmentAction(
  _previousState: AttendanceDutyActionState,
  formData: FormData
): Promise<AttendanceDutyActionState> {
  try {
    const ctx = await getTenantContext();
    await createStudentAttendanceDutyAssignment(ctx, {
      classSectionId: formData.get("classSectionId"),
      assignedUserId: formData.get("assignedUserId"),
      attendanceDate: formData.get("attendanceDate"),
      sessionType: "FULL_DAY",
      assignmentType: formData.get("assignmentType"),
      reasonCode: formData.get("reasonCode"),
      reasonText: formData.get("reasonText"),
      sourceType: "MANUAL",
      sourceEntityId: undefined,
      startsAt: optionalValue(formData, "startsAt"),
      expiresAt: optionalValue(formData, "expiresAt"),
      replaceExisting: formData.get("replaceExisting") === "on"
    });
    refreshAttendanceCoverage();
    return { ok: true, message: "Attendance duty assigned. The staff member must acknowledge it before marking attendance." };
  } catch (error) {
    return safeActionError(error);
  }
}

export async function acknowledgeStudentAttendanceDutyAction(
  _previousState: AttendanceDutyActionState,
  formData: FormData
): Promise<AttendanceDutyActionState> {
  try {
    const ctx = await getTenantContext();
    await acknowledgeStudentAttendanceDuty(ctx, { assignmentId: formData.get("assignmentId") });
    refreshAttendanceCoverage();
    return { ok: true, message: "Attendance duty acknowledged." };
  } catch (error) {
    return safeActionError(error);
  }
}

export async function declineStudentAttendanceDutyAction(
  _previousState: AttendanceDutyActionState,
  formData: FormData
): Promise<AttendanceDutyActionState> {
  try {
    const ctx = await getTenantContext();
    await declineStudentAttendanceDuty(ctx, {
      assignmentId: formData.get("assignmentId"),
      reason: formData.get("reason")
    });
    refreshAttendanceCoverage();
    return { ok: true, message: "Attendance duty declined. The coverage team can assign another staff member." };
  } catch (error) {
    return safeActionError(error);
  }
}

export async function revokeStudentAttendanceDutyAction(
  _previousState: AttendanceDutyActionState,
  formData: FormData
): Promise<AttendanceDutyActionState> {
  try {
    const ctx = await getTenantContext();
    await revokeStudentAttendanceDuty(ctx, {
      assignmentId: formData.get("assignmentId"),
      reason: formData.get("reason")
    });
    refreshAttendanceCoverage();
    return { ok: true, message: "Attendance duty revoked." };
  } catch (error) {
    return safeActionError(error);
  }
}
