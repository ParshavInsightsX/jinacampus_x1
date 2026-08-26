import { AppError } from "@/lib/errors";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { scanStaffAttendanceQr } from "@/modules/staffboard-lite/services/staff-qr.service";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { mobileAttendanceDateQuerySchema, mobileQrScanSchema } from "./schemas";

const DEFAULT_ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(timeZone = DEFAULT_ATTENDANCE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(valueByType.get("year")),
    Number(valueByType.get("month")) - 1,
    Number(valueByType.get("day"))
  ));
}

export async function scanMobileStaffAttendanceQr(ctx: TenantContext, input: unknown) {
  const data = mobileQrScanSchema.parse(input);
  const result = await scanStaffAttendanceQr(ctx, data);
  return {
    purpose: result.purpose,
    attendanceDate: result.attendanceDate,
    status: result.status,
    checkInAt: result.checkInAt ?? null,
    checkOutAt: result.checkOutAt ?? null,
    workingMinutes: result.workingMinutes ?? null,
    message: result.message
  };
}

export async function getMobileStaffAttendanceStatus(ctx: TenantContext, input: unknown = {}) {
  const params = mobileAttendanceDateQuerySchema.parse(input);
  const staffProfile = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      employmentStatus: "ACTIVE"
    },
    select: {
      id: true,
      branchId: true,
      branch: { select: { timezone: true, status: true } }
    }
  });
  if (!staffProfile) throw new AppError("ACTIVE_STAFF_PROFILE_NOT_FOUND", "ACTIVE_STAFF_PROFILE_NOT_FOUND", 400);
  if (staffProfile.branch.status !== "ACTIVE") throw new AppError("STAFF_BRANCH_INACTIVE", "STAFF_BRANCH_INACTIVE", 400);

  await requirePermission({ ctx, permission: "staffboard.attendance.self_view", branchId: staffProfile.branchId });
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }
  ], { branchId: staffProfile.branchId });

  const attendanceDate = params.date
    ? normalizeDateOnly(params.date)
    : dateInTimeZone(staffProfile.branch.timezone);
  const record = await db.staffAttendanceRecord.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: staffProfile.branchId,
      staffId: staffProfile.id,
      attendanceDate
    },
    select: {
      attendanceDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workingMinutes: true
    }
  });

  if (!record) {
    return {
      attendance: null,
      message: "No attendance recorded yet today."
    };
  }

  return {
    attendance: {
      attendanceDate: toDateOnlyString(record.attendanceDate),
      status: record.status,
      checkInAt: record.checkInAt?.toISOString() ?? null,
      checkOutAt: record.checkOutAt?.toISOString() ?? null,
      workingMinutes: record.workingMinutes ?? null
    }
  };
}
