"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { deactivateStaffQrSchema, generateStaffQrSchema } from "@/modules/staffboard-lite/schemas";
import {
  deactivateStaffAttendanceQrToken,
  generateStaffAttendanceQrToken
} from "@/modules/staffboard-lite/services/staff-qr.service";

export type StaffQrActionData = {
  qrTokenId: string;
  purpose: "CHECK_IN" | "CHECK_OUT";
  branchId: string;
  validFrom: string;
  validUntil: string;
  expiresInSeconds: number;
  status: "ACTIVE" | "DEACTIVATED" | "EXPIRED";
  qrPayload: string;
};

export type StaffQrActionResult =
  | { ok: true; data: StaffQrActionData }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

function actionError(error: unknown): StaffQrActionResult {
  return mapActionError(error, {
    fallbackMessage: "Unable to generate staff attendance QR. Please try again.",
    validationMessage: "Please check the QR settings and try again."
  });
}

export async function generateStaffAttendanceQrAction(input: unknown): Promise<StaffQrActionResult> {
  try {
    const parsedInput = generateStaffQrSchema.parse(input);
    const ctx = await getTenantContext();
    const result = await generateStaffAttendanceQrToken(ctx, parsedInput);
    const data: StaffQrActionData = {
      qrTokenId: result.qrTokenId,
      purpose: result.purpose,
      branchId: result.branchId,
      validFrom: result.validFrom,
      validUntil: result.validUntil,
      expiresInSeconds: result.expiresInSeconds,
      status: result.status,
      qrPayload: result.qrPayload
    };

    revalidatePath("/staffboard/attendance/qr");
    return { ok: true, data };
  } catch (error) {
    return actionError(error);
  }
}

export type DeactivateStaffQrActionResult =
  | {
      ok: true;
      data: {
        qrTokenId: string;
        status: "ACTIVE" | "DEACTIVATED" | "EXPIRED";
        deactivatedAt?: string;
        expiredAt?: string;
      };
    }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

export async function deactivateStaffAttendanceQrAction(input: unknown): Promise<DeactivateStaffQrActionResult> {
  try {
    const parsedInput = deactivateStaffQrSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await deactivateStaffAttendanceQrToken(ctx, parsedInput);

    revalidatePath("/staffboard/attendance/qr");
    return { ok: true, data };
  } catch (error) {
    return mapActionError(error, {
      fallbackMessage: "Unable to deactivate this attendance QR code. Please try again.",
      validationMessage: "This attendance QR request is not valid."
    });
  }
}
