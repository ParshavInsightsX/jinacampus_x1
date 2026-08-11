"use server";

import { revalidatePath } from "next/cache";
import { AppError, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { scanStaffQrPayloadSchema } from "@/modules/staffboard-lite/schemas";
import { scanStaffAttendanceQr } from "@/modules/staffboard-lite/services/staff-qr.service";
import { parseStaffAttendanceQrPayload } from "@/modules/staffboard-lite/utils/staff-qr-payload";

export type StaffQrScanActionData = {
  success: true;
  purpose: "CHECK_IN" | "CHECK_OUT";
  attendanceDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  workingMinutes?: number;
  status: string;
  message: string;
};

export type StaffQrScanActionResult =
  | { ok: true; data: StaffQrScanActionData }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

function scanActionError(error: unknown): StaffQrScanActionResult {
  return mapActionError(error, {
    fallbackMessage: "Unable to submit staff QR scan. Please try again.",
    validationMessage: "Enter a valid QR token before submitting."
  });
}

export async function scanStaffAttendanceQrAction(input: unknown): Promise<StaffQrScanActionResult> {
  try {
    const parsedInput = scanStaffQrPayloadSchema.parse(input);
    const parsedPayload = parseStaffAttendanceQrPayload(parsedInput.qrPayload);
    if (!parsedPayload.ok) {
      throw new AppError("INVALID_STAFF_QR", parsedPayload.error, 400);
    }

    const ctx = await getTenantContext();
    const result = await scanStaffAttendanceQr(ctx, { token: parsedPayload.token });
    const data: StaffQrScanActionData = {
      success: true,
      purpose: result.purpose,
      attendanceDate: result.attendanceDate,
      checkInAt: result.checkInAt,
      checkOutAt: result.checkOutAt,
      workingMinutes: result.workingMinutes,
      status: result.status,
      message: result.message
    };

    revalidatePath("/staffboard/attendance/scan");
    revalidatePath("/staffboard/attendance");
    revalidatePath("/staffboard/attendance/me");
    return { ok: true, data };
  } catch (error) {
    return scanActionError(error);
  }
}
