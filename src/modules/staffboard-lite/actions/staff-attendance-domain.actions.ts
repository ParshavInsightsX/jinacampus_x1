"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { requireIdentityCardSchema } from "@/lib/schema-readiness/identity-cards";
import { getTenantContext } from "@/lib/tenant/context";
import {
  issueStaffAttendanceCredentialSchema,
  revokeStaffAttendanceCredentialSchema,
  staffAttendanceCredentialIdSchema,
  startStaffAttendanceScanSessionSchema,
  closeStaffAttendanceScanSessionSchema,
  recordSupervisedStaffQrScanSchema,
  requestManualStaffAttendanceSchema,
  requestStaffAttendanceAdjustmentSchema,
  reviewStaffAttendanceAdjustmentSchema
} from "@/modules/staffboard-lite/schemas";
import {
  getStaffAttendanceCredentialCard,
  issueStaffAttendanceCredential,
  recordStaffAttendanceCredentialPrint,
  revokeStaffAttendanceCredential
} from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";
import {
  closeStaffAttendanceScanSession,
  recordSupervisedStaffQrScan,
  startStaffAttendanceScanSession
} from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";
import {
  requestManualStaffAttendance,
  requestStaffAttendanceAdjustment,
  reviewStaffAttendanceAdjustment
} from "@/modules/staffboard-lite/services/staff-attendance-adjustments.service";
import { getMyStaffAttendanceQrLiveState } from "@/modules/staffboard-lite/services/staff-attendance-self.service";

type ActionFailure = {
  ok: false;
  code: string;
  error: string;
  fieldErrors?: Record<string, string[]>;
};

type ActionSuccess<T> = { ok: true; data: T; message: string };
export type StaffAttendanceDomainActionResult<T> = ActionSuccess<T> | ActionFailure;

function actionError(error: unknown, fallbackMessage: string, validationMessage: string): ActionFailure {
  return mapActionError(error, { fallbackMessage, validationMessage });
}

function revalidateAttendance() {
  revalidatePath("/staffboard");
  revalidatePath("/staffboard/attendance");
  revalidatePath("/staffboard/attendance/me");
  revalidatePath("/staffboard/attendance/reports");
  revalidatePath("/staffboard/attendance/adjustments");
  revalidatePath("/staffboard/attendance/credentials");
  revalidatePath("/staffboard/attendance/card");
}

export async function issueStaffAttendanceCredentialAction(input: unknown) {
  try {
    const parsed = issueStaffAttendanceCredentialSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await issueStaffAttendanceCredential(ctx, parsed);
    revalidateAttendance();
    return { ok: true, data, message: "Staff attendance card created and ready for supervised scanning." } as const;
  } catch (error) {
    return actionError(error, "Unable to create the staff QR card. Please try again.", "Check the selected staff member and expiry date.");
  }
}

export async function previewStaffAttendanceCredentialAction(input: unknown) {
  try {
    const parsed = staffAttendanceCredentialIdSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await getStaffAttendanceCredentialCard(ctx, parsed.credentialId);
    return { ok: true, data, message: "Staff attendance card loaded." } as const;
  } catch (error) {
    return actionError(error, "Unable to open this staff attendance card.", "Select an active staff attendance card.");
  }
}

export async function recordStaffAttendanceCredentialPrintAction(input: unknown) {
  try {
    const parsed = staffAttendanceCredentialIdSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await recordStaffAttendanceCredentialPrint(ctx, parsed.credentialId);
    return { ok: true, data, message: "Staff attendance card print recorded." } as const;
  } catch (error) {
    return actionError(error, "Unable to prepare this staff attendance card for printing.", "Select an active staff attendance card.");
  }
}

export async function revokeStaffAttendanceCredentialAction(input: unknown) {
  try {
    const parsed = revokeStaffAttendanceCredentialSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await revokeStaffAttendanceCredential(ctx, parsed);
    revalidateAttendance();
    return { ok: true, data, message: "Staff QR card revoked." } as const;
  } catch (error) {
    return actionError(error, "Unable to revoke this staff QR card.", "Enter a clear reason before revoking the QR card.");
  }
}

export async function startStaffAttendanceScanSessionAction(input: unknown) {
  try {
    const parsed = startStaffAttendanceScanSessionSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await startStaffAttendanceScanSession(ctx, parsed);
    return { ok: true, data, message: "Attendance scanner is ready." } as const;
  } catch (error) {
    return actionError(error, "Unable to start the attendance scanner.", "Select a branch and scan mode.");
  }
}

export async function closeStaffAttendanceScanSessionAction(input: unknown) {
  try {
    const parsed = closeStaffAttendanceScanSessionSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await closeStaffAttendanceScanSession(ctx, parsed);
    return { ok: true, data, message: "Attendance scanner stopped." } as const;
  } catch (error) {
    return actionError(error, "Unable to stop the attendance scanner.", "The scanner session is not valid.");
  }
}

export async function recordSupervisedStaffQrScanAction(formData: FormData) {
  try {
    const parsed = recordSupervisedStaffQrScanSchema.parse({
      sessionId: formData.get("sessionId"),
      qrPayload: formData.get("qrPayload"),
      clientRequestId: formData.get("clientRequestId")
    });
    const ctx = await getTenantContext();
    const data = await recordSupervisedStaffQrScan(ctx, parsed);
    revalidateAttendance();
    const action = data.eventType === "CHECK_IN" ? "Check-in" : "Check-out";
    return { ok: true, data, message: `${action} recorded for ${data.staffName}.` } as const;
  } catch (error) {
    return actionError(error, "Unable to record staff attendance.", "This QR card or scanner session is not valid.");
  }
}

export async function pollMyStaffAttendanceQrAction(input: unknown) {
  try {
    const parsed = staffAttendanceCredentialIdSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await getMyStaffAttendanceQrLiveState(ctx, parsed.credentialId);
    return { ok: true, data, message: "Attendance status refreshed." } as const;
  } catch (error) {
    return actionError(
      error,
      "Unable to refresh your attendance status.",
      "The Attendance QR is not valid for this account."
    );
  }
}

export async function requestStaffAttendanceAdjustmentAction(input: unknown) {
  try {
    const parsed = requestStaffAttendanceAdjustmentSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await requestStaffAttendanceAdjustment(ctx, parsed);
    revalidateAttendance();
    return { ok: true, data: { adjustmentId: data.id, status: data.status }, message: "Attendance correction sent for approval." } as const;
  } catch (error) {
    return actionError(error, "Unable to submit the attendance correction.", "Check the requested correction and enter a clear reason.");
  }
}

export async function requestManualStaffAttendanceAction(input: unknown) {
  try {
    const parsed = requestManualStaffAttendanceSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await requestManualStaffAttendance(ctx, parsed);
    revalidateAttendance();
    return { ok: true, data: { adjustmentId: data.id, status: data.status }, message: "Manual attendance sent for approval." } as const;
  } catch (error) {
    return actionError(error, "Unable to submit manual attendance.", "Check the staff member, date, status, and reason.");
  }
}

export async function reviewStaffAttendanceAdjustmentAction(input: unknown) {
  try {
    const parsed = reviewStaffAttendanceAdjustmentSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await reviewStaffAttendanceAdjustment(ctx, parsed);
    revalidateAttendance();
    return {
      ok: true,
      data,
      message: parsed.decision === "APPROVE" ? "Attendance correction approved and applied." : "Attendance correction rejected."
    } as const;
  } catch (error) {
    return actionError(error, "Unable to review this attendance correction.", "Enter a review note and choose approve or reject.");
  }
}
