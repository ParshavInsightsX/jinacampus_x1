import type { StaffAttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import type { TenantContext } from "@/lib/tenant/context";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { correctStaffAttendanceSchema } from "@/modules/staffboard-lite/schemas";
import {
  calculateCheckInStatus,
  calculateCheckOutStatus,
  calculateFinalAttendanceStatus,
  calculateWorkingMinutes,
  resolveStaffAttendanceCalculationSettings
} from "@/modules/staffboard-lite/utils/attendance-calculator";
import { requireBranchPermission, validationError } from "./shared";

export type CorrectStaffAttendanceResult = {
  attendanceRecordId: string;
  staffId: string;
  branchId: string;
  attendanceDate: string;
  previousStatus: StaffAttendanceStatus;
  newStatus: StaffAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  correctionReason: string;
  correctedById: string;
};

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toIsoOrNull(date: Date | null) {
  return date ? date.toISOString() : null;
}

export async function correctStaffAttendance(
  ctx: TenantContext,
  input: unknown
): Promise<CorrectStaffAttendanceResult> {
  const data = correctStaffAttendanceSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const recordScope = await db.staffAttendanceRecord.findFirst({
    where: {
      id: data.attendanceRecordId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: { branchId: true }
  });
  if (!recordScope) throw notFound("STAFF_ATTENDANCE_RECORD_NOT_FOUND");
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.CORRECTION, operation: "WRITE" }
  ], { branchId: recordScope.branchId });

  return db.$transaction(async (tx) => {
    const before = await tx.staffAttendanceRecord.findFirst({
      where: {
        id: data.attendanceRecordId,
        tenantId: ctx.tenantId,
        branchId: { in: ctx.accessibleBranchIds }
      },
      include: {
        branch: { select: { id: true, timezone: true, status: true } }
      }
    });
    if (!before) throw notFound("STAFF_ATTENDANCE_RECORD_NOT_FOUND");
    if (before.branch.status === "ARCHIVED") throw notFound("STAFF_ATTENDANCE_RECORD_NOT_FOUND");
    if (before.leaveApplicationId) throw validationError("STAFF_ATTENDANCE_MANAGED_BY_LEAVE");
    if (before.calendarEntryId) throw validationError("STAFF_ATTENDANCE_MANAGED_BY_CALENDAR");

    await requireBranchPermission(ctx, "staffboard.attendance.correct", before.branchId);

    const nextCheckInAt = data.checkInAt ?? before.checkInAt;
    const nextCheckOutAt = data.checkOutAt ?? before.checkOutAt;
    if (nextCheckInAt && nextCheckOutAt && nextCheckOutAt < nextCheckInAt) {
      throw validationError("STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN");
    }

    const timeFieldsChanged = data.checkInAt !== undefined || data.checkOutAt !== undefined;
    const nextWorkingMinutes =
      timeFieldsChanged && nextCheckInAt && nextCheckOutAt
        ? calculateWorkingMinutes(nextCheckInAt, nextCheckOutAt)
        : timeFieldsChanged
          ? null
          : before.workingMinutes;

    const attendanceSetting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId: before.branchId },
      select: {
        staffLateAfterTime: true,
        staffHalfDayBeforeMinutes: true,
        staffMinimumWorkingMinutes: true
      }
    });
    const calculationSettings = resolveStaffAttendanceCalculationSettings({
      staffLateAfterTime: attendanceSetting?.staffLateAfterTime,
      staffHalfDayBeforeMinutes: attendanceSetting?.staffHalfDayBeforeMinutes,
      staffMinimumWorkingMinutes: attendanceSetting?.staffMinimumWorkingMinutes,
      timeZone: before.branch.timezone
    });
    const calculatedCheckInStatus = nextCheckInAt
      ? calculateCheckInStatus({ checkInAt: nextCheckInAt, settings: calculationSettings })
      : null;
    const calculatedCheckOutStatus =
      typeof nextWorkingMinutes === "number"
        ? calculateCheckOutStatus({ workingMinutes: nextWorkingMinutes, settings: calculationSettings })
        : null;
    const calculatedFinalStatus = calculateFinalAttendanceStatus({
      checkInStatus: calculatedCheckInStatus,
      checkOutStatus: calculatedCheckOutStatus
    });

    const updateData: {
      status: StaffAttendanceStatus;
      checkInAt?: Date;
      checkOutAt?: Date;
      workingMinutes: number | null;
      correctionReason: string;
      updatedById: string;
    } = {
      status: data.status,
      workingMinutes: nextWorkingMinutes,
      correctionReason: data.correctionReason,
      updatedById: ctx.userId
    };
    if (data.checkInAt !== undefined) updateData.checkInAt = data.checkInAt;
    if (data.checkOutAt !== undefined) updateData.checkOutAt = data.checkOutAt;

    const after = await tx.staffAttendanceRecord.update({
      where: { id: before.id },
      data: updateData
    });

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CORRECTED,
      entityType: "StaffAttendanceRecord",
      entityId: after.id,
      branchId: after.branchId,
      academicYearId: after.academicYearId,
      before,
      after,
      metadata: {
        tenantId: ctx.tenantId,
        branchId: after.branchId,
        actorUserId: ctx.userId,
        attendanceRecordId: after.id,
        staffId: after.staffId,
        attendanceDate: toDateOnlyString(after.attendanceDate),
        previousStatus: before.status,
        newStatus: after.status,
        previousCheckInAt: toIsoOrNull(before.checkInAt),
        newCheckInAt: toIsoOrNull(after.checkInAt),
        previousCheckOutAt: toIsoOrNull(before.checkOutAt),
        newCheckOutAt: toIsoOrNull(after.checkOutAt),
        previousWorkingMinutes: before.workingMinutes,
        newWorkingMinutes: after.workingMinutes,
        correctionReason: data.correctionReason,
        calculatedCheckInStatus,
        calculatedCheckOutStatus,
        calculatedFinalStatus,
        thresholds: {
          lateAfterTime: calculationSettings.staffLateAfterTime,
          halfDayBeforeMinutes: calculationSettings.staffHalfDayBeforeMinutes,
          fullDayMinutes: calculationSettings.staffMinimumWorkingMinutes,
          timeZone: calculationSettings.timeZone
        }
      }
    }, tx);

    return {
      attendanceRecordId: after.id,
      staffId: after.staffId,
      branchId: after.branchId,
      attendanceDate: toDateOnlyString(after.attendanceDate),
      previousStatus: before.status,
      newStatus: after.status,
      checkInAt: toIsoOrNull(after.checkInAt),
      checkOutAt: toIsoOrNull(after.checkOutAt),
      workingMinutes: after.workingMinutes,
      correctionReason: after.correctionReason ?? data.correctionReason,
      correctedById: ctx.userId
    };
  });
}
