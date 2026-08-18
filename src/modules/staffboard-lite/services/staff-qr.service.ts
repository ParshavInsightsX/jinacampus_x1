import { createHash, randomBytes } from "node:crypto";
import type { Prisma, StaffAttendanceStatus, StaffQrPurpose, StaffQrTokenStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { writeAuditLog } from "@/lib/audit/audit-log";
import type { TenantContext } from "@/lib/tenant/context";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";
import { staffCalendarAudience } from "@/modules/campus-core/calendar/calendar-utils";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import { deactivateStaffQrSchema, generateStaffQrSchema, scanStaffQrSchema } from "@/modules/staffboard-lite/schemas";
import { requireStaffQrOperatorAccess } from "@/modules/staffboard-lite/staff-qr-access";
import {
  calculateCheckInStatus,
  calculateCheckOutStatus,
  calculateFinalAttendanceStatus,
  calculateWorkingMinutes,
  resolveStaffAttendanceCalculationSettings
} from "@/modules/staffboard-lite/utils/attendance-calculator";
import { conflict, ensureActiveBranch, validationError } from "./shared";

const STAFF_ATTENDANCE_QR_PAYLOAD_TYPE = "STAFF_ATTENDANCE_QR";
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

function generateRawQrToken() {
  return randomBytes(32).toString("base64url");
}

function buildQrPayload(rawToken: string) {
  return JSON.stringify({ type: STAFF_ATTENDANCE_QR_PAYLOAD_TYPE, token: rawToken });
}

function resolveQrBranchId(ctx: TenantContext, inputBranchId?: string) {
  if (inputBranchId) return inputBranchId;
  if (ctx.activeBranchId) return ctx.activeBranchId;
  if (ctx.accessibleBranchIds.length === 1) return ctx.accessibleBranchIds[0];
  throw validationError("STAFF_QR_BRANCH_REQUIRED");
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(valueByType.get("year")),
    month: Number(valueByType.get("month")),
    day: Number(valueByType.get("day")),
    hour: Number(valueByType.get("hour")),
    minute: Number(valueByType.get("minute")),
    second: Number(valueByType.get("second"))
  };
}

function attendanceDateForBranch(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function scanMessage(purpose: StaffQrPurpose) {
  return purpose === "CHECK_IN" ? "Check-in successful" : "Check-out successful";
}

function institutionAuditLabel(ctx: TenantContext) {
  return ctx.institutionDisplayName ?? ctx.institutionName ?? ctx.tenantName ?? null;
}

const qrLifecycleSelect = {
  id: true,
  branchId: true,
  purpose: true,
  status: true,
  validFrom: true,
  validUntil: true,
  consumedCount: true,
  lastUsedAt: true,
  expiredAt: true,
  deactivatedAt: true,
  deactivationReason: true,
  createdAt: true,
  updatedAt: true
} as const satisfies Prisma.StaffAttendanceQrTokenSelect;

type StaffQrLifecycleSnapshot = Prisma.StaffAttendanceQrTokenGetPayload<{
  select: typeof qrLifecycleSelect;
}>;

async function expireStaleStaffQrTokens(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  input: { branchId: string; purpose?: StaffQrPurpose },
  now: Date
) {
  const staleTokens = await tx.staffAttendanceQrToken.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      purpose: input.purpose,
      status: "ACTIVE",
      validUntil: { lte: now }
    },
    select: qrLifecycleSelect
  });

  for (const before of staleTokens) {
    const after = await tx.staffAttendanceQrToken.update({
      where: { id: before.id },
      data: {
        status: "EXPIRED",
        expiredAt: before.validUntil
      },
      select: qrLifecycleSelect
    });

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_EXPIRED,
      entityType: "StaffAttendanceQrToken",
      entityId: before.id,
      branchId: before.branchId,
      before,
      after,
      metadata: {
        institutionName: institutionAuditLabel(ctx),
        purpose: before.purpose,
        validUntil: before.validUntil.toISOString(),
        lifecycleTrigger: "SERVER_VALIDITY_CHECK"
      }
    }, tx);
  }

  return staleTokens.length;
}

export async function generateStaffAttendanceQrToken(
  ctx: TenantContext,
  input: unknown
): Promise<GenerateStaffAttendanceQrTokenResult> {
  const data = generateStaffQrSchema.parse(input);
  const branchId = resolveQrBranchId(ctx, data.branchId);

  await requireStaffQrOperatorAccess(ctx, branchId);

  return db.$transaction(async (tx) => {
    await ensureActiveBranch(tx, ctx, branchId);

    const attendanceSetting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId },
      select: {
        staffQrAttendanceEnabled: true
      }
    });

    if (attendanceSetting?.staffQrAttendanceEnabled === false) {
      throw new AppError("STAFF_QR_ATTENDANCE_DISABLED", "STAFF_QR_ATTENDANCE_DISABLED", 403);
    }

    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + STAFF_QR_TOKEN_VALIDITY_SECONDS * 1000);

    await expireStaleStaffQrTokens(tx, ctx, { branchId, purpose: data.purpose }, validFrom);

    const activeTokens = await tx.staffAttendanceQrToken.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId,
        purpose: data.purpose,
        status: "ACTIVE"
      },
      select: qrLifecycleSelect
    });
    const deactivatedTokens: Array<{
      before: StaffQrLifecycleSnapshot;
      after: StaffQrLifecycleSnapshot;
    }> = [];
    for (const token of activeTokens) {
      deactivatedTokens.push({
        before: token,
        after: await tx.staffAttendanceQrToken.update({
          where: { id: token.id },
          data: {
            status: "DEACTIVATED",
            deactivatedAt: validFrom,
            deactivatedById: ctx.userId,
            deactivationReason: "REGENERATED"
          },
          select: qrLifecycleSelect
        })
      });
    }

    const rawToken = generateRawQrToken();
    const tokenHash = hashStaffAttendanceQrToken(rawToken);

    const qrToken = await tx.staffAttendanceQrToken.create({
      data: {
        tenantId: ctx.tenantId,
        branchId,
        tokenHash,
        purpose: data.purpose,
        status: "ACTIVE",
        validFrom,
        validUntil,
        consumedCount: 0,
        createdById: ctx.userId
      },
      select: {
        id: true,
        purpose: true,
        branchId: true,
        validFrom: true,
        validUntil: true,
        status: true
      }
    });

    for (const token of deactivatedTokens) {
      await writeAuditLog({
        ctx,
        action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_DEACTIVATED,
        entityType: "StaffAttendanceQrToken",
        entityId: token.before.id,
        branchId,
        before: token.before,
        after: token.after,
        metadata: {
          institutionName: institutionAuditLabel(ctx),
          purpose: token.before.purpose,
          reason: "REGENERATED",
          replacementQrTokenId: qrToken.id
        }
      }, tx);
    }

    await writeAuditLog({
      ctx,
      action: activeTokens.length > 0
        ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_REGENERATED
        : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_GENERATED,
      entityType: "StaffAttendanceQrToken",
      entityId: qrToken.id,
      branchId,
      metadata: {
        institutionName: institutionAuditLabel(ctx),
        purpose: qrToken.purpose,
        validFrom: qrToken.validFrom.toISOString(),
        validUntil: qrToken.validUntil.toISOString(),
        expiresInSeconds: STAFF_QR_TOKEN_VALIDITY_SECONDS,
        replacedTokenCount: activeTokens.length
      }
    }, tx);

    return {
      qrTokenId: qrToken.id,
      purpose: qrToken.purpose,
      branchId: qrToken.branchId,
      validFrom: qrToken.validFrom.toISOString(),
      validUntil: qrToken.validUntil.toISOString(),
      expiresInSeconds: STAFF_QR_TOKEN_VALIDITY_SECONDS,
      status: "ACTIVE",
      qrPayload: buildQrPayload(rawToken)
    };
  });
}

export async function deactivateStaffAttendanceQrToken(
  ctx: TenantContext,
  input: unknown
): Promise<DeactivateStaffAttendanceQrTokenResult> {
  const data = deactivateStaffQrSchema.parse(input);
  const scopedToken = await db.staffAttendanceQrToken.findFirst({
    where: {
      id: data.qrTokenId,
      tenantId: ctx.tenantId
    },
    select: {
      id: true,
      branchId: true
    }
  });
  if (!scopedToken) throw notFound("STAFF_QR_NOT_FOUND");

  await requireStaffQrOperatorAccess(ctx, scopedToken.branchId);

  return db.$transaction(async (tx) => {
    const now = new Date();
    await expireStaleStaffQrTokens(tx, ctx, { branchId: scopedToken.branchId }, now);

    const before = await tx.staffAttendanceQrToken.findFirst({
      where: {
        id: scopedToken.id,
        tenantId: ctx.tenantId,
        branchId: scopedToken.branchId
      },
      select: qrLifecycleSelect
    });
    if (!before) throw notFound("STAFF_QR_NOT_FOUND");

    if (before.status !== "ACTIVE") {
      return {
        qrTokenId: before.id,
        status: before.status,
        ...(before.deactivatedAt ? { deactivatedAt: before.deactivatedAt.toISOString() } : {}),
        ...(before.expiredAt ? { expiredAt: before.expiredAt.toISOString() } : {})
      };
    }

    const after = await tx.staffAttendanceQrToken.update({
      where: { id: before.id },
      data: {
        status: "DEACTIVATED",
        deactivatedAt: now,
        deactivatedById: ctx.userId,
        deactivationReason: "OPERATOR_DEACTIVATED"
      },
      select: qrLifecycleSelect
    });

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_DEACTIVATED,
      entityType: "StaffAttendanceQrToken",
      entityId: before.id,
      branchId: before.branchId,
      before,
      after,
      metadata: {
        institutionName: institutionAuditLabel(ctx),
        purpose: before.purpose,
        reason: "OPERATOR_DEACTIVATED"
      }
    }, tx);

    return {
      qrTokenId: after.id,
      status: after.status,
      deactivatedAt: after.deactivatedAt?.toISOString()
    };
  });
}

export async function scanStaffAttendanceQr(
  ctx: TenantContext,
  input: unknown
): Promise<ScanStaffAttendanceQrResult> {
  const data = scanStaffQrSchema.parse(input);
  const tokenHash = hashStaffAttendanceQrToken(data.token);
  const now = new Date();

  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const outcome = await db.$transaction(async (tx) => {
    const staffProfile = await tx.staffProfile.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        employmentStatus: "ACTIVE"
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        staffType: true,
        branch: { select: { id: true, institutionId: true, timezone: true, status: true } }
      }
    });
    if (!staffProfile) throw validationError("ACTIVE_STAFF_PROFILE_NOT_FOUND");
    if (staffProfile.branch.status === "ARCHIVED") throw validationError("STAFF_BRANCH_INACTIVE");

    await requirePermission({ ctx, permission: "staffboard.attendance.self_scan", branchId: staffProfile.branchId });

    const qrToken = await tx.staffAttendanceQrToken.findFirst({
      where: {
        tenantId: ctx.tenantId,
        tokenHash
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        purpose: true,
        status: true,
        validFrom: true,
        validUntil: true
      }
    });
    if (!qrToken) throw validationError("INVALID_STAFF_QR");
    if (qrToken.status === "DEACTIVATED") throw validationError("INVALID_STAFF_QR");
    if (qrToken.status === "EXPIRED" || qrToken.validFrom > now || qrToken.validUntil <= now) {
      if (qrToken.status === "ACTIVE" && qrToken.validUntil <= now) {
        const expiredToken = await tx.staffAttendanceQrToken.update({
          where: { id: qrToken.id },
          data: {
            status: "EXPIRED",
            expiredAt: qrToken.validUntil
          },
          select: qrLifecycleSelect
        });

        await writeAuditLog({
          ctx,
          action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_EXPIRED,
          entityType: "StaffAttendanceQrToken",
          entityId: qrToken.id,
          branchId: qrToken.branchId,
          after: expiredToken,
          metadata: {
            institutionName: institutionAuditLabel(ctx),
            purpose: qrToken.purpose,
            validUntil: qrToken.validUntil.toISOString(),
            lifecycleTrigger: "SCAN_VALIDITY_CHECK"
          }
        }, tx);
      }

      return { kind: "expired" as const };
    }
    if (qrToken.branchId !== staffProfile.branchId) {
      throw new AppError("STAFF_QR_BRANCH_MISMATCH", "STAFF_QR_BRANCH_MISMATCH", 403);
    }

    const attendanceSetting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId: staffProfile.branchId },
      select: {
        staffQrAttendanceEnabled: true,
        staffLateAfterTime: true,
        staffHalfDayBeforeMinutes: true,
        staffMinimumWorkingMinutes: true
      }
    });
    if (attendanceSetting?.staffQrAttendanceEnabled === false) {
      throw new AppError("STAFF_QR_ATTENDANCE_DISABLED", "STAFF_QR_ATTENDANCE_DISABLED", 403);
    }

    const calculationSettings = resolveStaffAttendanceCalculationSettings({
      staffLateAfterTime: attendanceSetting?.staffLateAfterTime,
      staffHalfDayBeforeMinutes: attendanceSetting?.staffHalfDayBeforeMinutes,
      staffMinimumWorkingMinutes: attendanceSetting?.staffMinimumWorkingMinutes,
      timeZone: staffProfile.branch.timezone
    });
    const attendanceDate = attendanceDateForBranch(now, calculationSettings.timeZone);
    const holiday = await findApplicableCalendarEntry(tx, {
      tenantId: ctx.tenantId,
      institutionId: staffProfile.branch.institutionId,
      branchId: staffProfile.branchId,
      academicYearId: ctx.activeAcademicYearId,
      attendanceDate,
      audience: staffCalendarAudience(staffProfile.staffType)
    });
    if (holiday) throw new AppError("STAFF_ATTENDANCE_HOLIDAY", "STAFF_ATTENDANCE_HOLIDAY", 409);
    const existingRecord = await tx.staffAttendanceRecord.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: staffProfile.branchId,
        staffId: staffProfile.id,
        attendanceDate
      }
    });
    if (existingRecord?.calendarEntryId || existingRecord?.status === "HOLIDAY") {
      throw new AppError("STAFF_ATTENDANCE_HOLIDAY", "STAFF_ATTENDANCE_HOLIDAY", 409);
    }
    if (existingRecord?.leaveApplicationId) {
      throw new AppError("STAFF_ON_APPROVED_LEAVE", "STAFF_ON_APPROVED_LEAVE", 409);
    }

    const before = existingRecord;
    let after;
    let checkInStatus: "PRESENT" | "LATE" | null = null;
    let checkOutStatus: "PRESENT" | "HALF_DAY" | null = null;
    let workingMinutes: number | null = null;

    if (qrToken.purpose === "CHECK_IN") {
      if (existingRecord?.checkInAt) throw conflict("STAFF_ALREADY_CHECKED_IN");
      checkInStatus = calculateCheckInStatus({ checkInAt: now, settings: calculationSettings });
      const status = calculateFinalAttendanceStatus({ checkInStatus });

      if (existingRecord) {
        after = await tx.staffAttendanceRecord.update({
          where: { id: existingRecord.id },
          data: {
            status,
            checkInAt: now,
            checkInSource: "QR_SCAN",
            checkInQrTokenId: qrToken.id,
            markedById: ctx.userId,
            updatedById: ctx.userId
          }
        });
      } else {
        after = await tx.staffAttendanceRecord.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: staffProfile.branchId,
            academicYearId: ctx.activeAcademicYearId,
            staffId: staffProfile.id,
            attendanceDate,
            status,
            checkInAt: now,
            checkInSource: "QR_SCAN",
            checkInQrTokenId: qrToken.id,
            markedById: ctx.userId
          }
        });
      }
    } else {
      if (!existingRecord) throw conflict("STAFF_CHECK_IN_REQUIRED");
      if (!existingRecord.checkInAt) throw conflict("STAFF_CHECK_IN_REQUIRED");
      if (existingRecord.checkOutAt) throw conflict("STAFF_ALREADY_CHECKED_OUT");

      checkInStatus = calculateCheckInStatus({
        checkInAt: existingRecord.checkInAt,
        settings: calculationSettings
      });
      workingMinutes = calculateWorkingMinutes(existingRecord.checkInAt, now);
      checkOutStatus = calculateCheckOutStatus({ workingMinutes, settings: calculationSettings });
      const status = calculateFinalAttendanceStatus({ checkInStatus, checkOutStatus });
      after = await tx.staffAttendanceRecord.update({
        where: { id: existingRecord.id },
        data: {
          status,
          checkOutAt: now,
          checkOutSource: "QR_SCAN",
          checkOutQrTokenId: qrToken.id,
          workingMinutes,
          updatedById: ctx.userId
        }
      });
    }

    await tx.staffAttendanceQrToken.update({
      where: { id: qrToken.id },
      data: {
        consumedCount: { increment: 1 },
        lastUsedAt: now
      }
    });

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_USED,
      entityType: "StaffAttendanceQrToken",
      entityId: qrToken.id,
      branchId: staffProfile.branchId,
      academicYearId: after.academicYearId,
      metadata: {
        institutionId: staffProfile.branch.institutionId,
        staffId: staffProfile.id,
        attendanceRecordId: after.id,
        purpose: qrToken.purpose,
        usedAt: now.toISOString()
      }
    }, tx);

    await writeAuditLog({
      ctx,
      action:
        qrToken.purpose === "CHECK_IN"
          ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CHECK_IN
          : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CHECK_OUT,
      entityType: "StaffAttendanceRecord",
      entityId: after.id,
      branchId: staffProfile.branchId,
      academicYearId: after.academicYearId,
      before,
      after,
      metadata: {
        tenantId: ctx.tenantId,
        branchId: staffProfile.branchId,
        staffId: staffProfile.id,
        actorUserId: ctx.userId,
        attendanceRecordId: after.id,
        timestamp: now.toISOString(),
        purpose: qrToken.purpose,
        qrTokenId: qrToken.id,
        checkInStatus,
        checkOutStatus,
        workingMinutes,
        thresholds: {
          lateAfterTime: calculationSettings.staffLateAfterTime,
          halfDayBeforeMinutes: calculationSettings.staffHalfDayBeforeMinutes,
          fullDayMinutes: calculationSettings.staffMinimumWorkingMinutes,
          timeZone: calculationSettings.timeZone
        }
      }
    }, tx);

    return {
      kind: "success" as const,
      result: {
        success: true as const,
        purpose: qrToken.purpose,
        attendanceDate: toDateOnlyString(attendanceDate),
        checkInAt: after.checkInAt?.toISOString(),
        checkOutAt: after.checkOutAt?.toISOString(),
        ...(typeof after.workingMinutes === "number" ? { workingMinutes: after.workingMinutes } : {}),
        status: after.status,
        message: scanMessage(qrToken.purpose)
      }
    };
  });

  if (outcome.kind === "expired") throw validationError("STAFF_QR_EXPIRED");
  return outcome.result;
}
