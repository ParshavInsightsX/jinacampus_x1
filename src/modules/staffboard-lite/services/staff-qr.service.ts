import { createHash } from "node:crypto";
import type { StaffAttendanceStatus, StaffQrPurpose, StaffQrTokenStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";

export const STAFF_QR_TOKEN_VALIDITY_SECONDS = 5 * 60 * 60;

export type GenerateStaffAttendanceQrTokenResult = {
  qrTokenId: string;
  purpose: StaffQrPurpose;
  branchId: string;
  validFrom: string;
  validUntil: string;
  expiresInSeconds: number;
  status: "ACTIVE";
  qrPayload: string;
};

export type DeactivateStaffAttendanceQrTokenResult = {
  qrTokenId: string;
  status: StaffQrTokenStatus;
  deactivatedAt?: string;
  expiredAt?: string;
};

export type ScanStaffAttendanceQrResult = {
  success: true;
  purpose: StaffQrPurpose;
  attendanceDate: string;
  checkInAt?: string;
  checkOutAt?: string;
  workingMinutes?: number;
  status: StaffAttendanceStatus;
  message: string;
};

export function hashStaffAttendanceQrToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Shared gate QR generation was retired when supervised Staff QR Cards became
 * authoritative. Keep this denial export so older clients fail closed.
 */
export async function generateStaffAttendanceQrToken(
  ctx: TenantContext,
  input: unknown
): Promise<GenerateStaffAttendanceQrTokenResult> {
  void ctx;
  void input;
  throw new AppError("STAFF_SHARED_QR_RETIRED", "STAFF_SHARED_QR_RETIRED", 410);
}

export async function deactivateStaffAttendanceQrToken(
  ctx: TenantContext,
  input: unknown
): Promise<DeactivateStaffAttendanceQrTokenResult> {
  void ctx;
  void input;
  throw new AppError("STAFF_SHARED_QR_RETIRED", "STAFF_SHARED_QR_RETIRED", 410);
}

/**
 * Staff self-scan is intentionally unavailable. Attendance QR payloads are
 * accepted only by the authorised operator session service.
 */
export async function scanStaffAttendanceQr(
  ctx: TenantContext,
  input: unknown
): Promise<ScanStaffAttendanceQrResult> {
  void ctx;
  void input;
  throw new AppError("STAFF_SELF_SCAN_DISABLED", "STAFF_SELF_SCAN_DISABLED", 403);
}