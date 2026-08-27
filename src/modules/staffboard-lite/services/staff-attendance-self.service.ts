import { db } from "@/lib/db";
import { dateOnlyInTimeZone } from "@/lib/dates/time-zone";
import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireStaffAttendanceFeature } from "./staff-attendance-domain.shared";

export type StaffAttendanceQrCredentialState = "ACTIVE" | "EXPIRED" | "SUSPENDED" | "UNAVAILABLE";

export type StaffAttendanceQrLiveState = {
  credentialState: StaffAttendanceQrCredentialState;
  attendance: {
    attendanceDate: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    workingMinutes: number | null;
  } | null;
};

export async function getMyStaffAttendanceQrLiveState(
  ctx: TenantContext,
  credentialId: string
): Promise<StaffAttendanceQrLiveState> {
  if (!ctx.userId) throw new AppError("ACTOR_REQUIRED", "ACTOR_REQUIRED", 401);

  const staff = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE",
      branch: ctx.institutionId ? { institutionId: ctx.institutionId, status: "ACTIVE" } : { status: "ACTIVE" }
    },
    select: {
      id: true,
      branchId: true,
      branch: { select: { timezone: true } }
    }
  });
  if (!staff) throw new AppError("ACTIVE_STAFF_PROFILE_NOT_FOUND", "ACTIVE_STAFF_PROFILE_NOT_FOUND", 400);

  await Promise.all([
    requirePermission({
      ctx,
      permission: "staffboard.attendance.credential.self_view",
      branchId: staff.branchId
    }),
    requirePermission({
      ctx,
      permission: "staffboard.attendance.self_view",
      branchId: staff.branchId
    }),
    requireStaffAttendanceFeature(
      ctx,
      staff.branchId,
      ATTENDANCE_ENTITLEMENT_FEATURES.QR,
      "READ"
    )
  ]);

  const attendanceDate = dateOnlyInTimeZone(new Date(), staff.branch.timezone);
  const [credential, attendance] = await Promise.all([
    db.staffAttendanceCredential.findFirst({
      where: {
        id: credentialId,
        tenantId: ctx.tenantId,
        staffId: staff.id,
        credentialType: "STATIC_QR"
      },
      select: { status: true, expiresAt: true }
    }),
    db.staffAttendanceRecord.findUnique({
      where: {
        tenantId_branchId_staffId_attendanceDate: {
          tenantId: ctx.tenantId,
          branchId: staff.branchId,
          staffId: staff.id,
          attendanceDate
        }
      },
      select: {
        attendanceDate: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        workingMinutes: true
      }
    })
  ]);

  let credentialState: StaffAttendanceQrCredentialState = "ACTIVE";
  if (!credential) credentialState = "UNAVAILABLE";
  else if (credential.status !== "ACTIVE") credentialState = "SUSPENDED";
  else if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) credentialState = "EXPIRED";

  return {
    credentialState,
    attendance: attendance
      ? {
          attendanceDate: attendance.attendanceDate.toISOString().slice(0, 10),
          status: attendance.status,
          checkInAt: attendance.checkInAt?.toISOString() ?? null,
          checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
          workingMinutes: attendance.workingMinutes
        }
      : null
  };
}
