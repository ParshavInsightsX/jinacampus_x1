import { randomUUID } from "node:crypto";
import type { Prisma, StaffAttendanceAdjustmentType, StaffAttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  requestManualStaffAttendanceSchema,
  requestStaffAttendanceAdjustmentSchema,
  reviewStaffAttendanceAdjustmentSchema
} from "@/modules/staffboard-lite/schemas";
import { calculateStaffAttendanceProjection } from "@/modules/staffboard-lite/utils/staff-attendance-projection";
import {
  acquireStaffAttendanceDayLock,
  requireStaffAttendanceFeature,
  resolveStaffAttendanceBranchId,
  resolveStaffAttendanceProjectionPolicy,
  STAFF_ATTENDANCE_TRANSACTION_OPTIONS,
  staffAttendanceDateString
} from "./staff-attendance-domain.shared";
import { validationError } from "./shared";

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

function jsonDate(value: Prisma.JsonValue | undefined) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function adjustmentStatus(type: StaffAttendanceAdjustmentType): StaffAttendanceStatus | null {
  if (type === "SET_PRESENT") return "PRESENT";
  if (type === "SET_ABSENT") return "ABSENT";
  if (type === "SET_HALF_DAY") return "HALF_DAY";
  if (type === "SET_ON_LEAVE") return "ON_LEAVE";
  if (type === "SET_OFFICIAL_DUTY") return "OFFICIAL_DUTY";
  return null;
}

async function requireAdjustmentAccess(
  ctx: TenantContext,
  branchId: string,
  permission:
    | "staffboard.attendance.adjustment.request"
    | "staffboard.attendance.adjustment.approve"
    | "staffboard.attendance.correct"
    | "staffboard.attendance.manual"
) {
  await requirePermission({ ctx, permission, branchId });
  await requireStaffAttendanceFeature(
    ctx,
    branchId,
    ATTENDANCE_ENTITLEMENT_FEATURES.CORRECTION,
    "WRITE"
  );
  if (permission === "staffboard.attendance.adjustment.approve") {
    await requireStaffAttendanceFeature(
      ctx,
      branchId,
      ATTENDANCE_ENTITLEMENT_FEATURES.APPROVAL_AUDIT,
      "WRITE"
    );
  }
}

async function createAdjustment(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  input: {
    record: {
      id: string;
      branchId: string;
      staffId: string;
      attendanceDate: Date;
      status: StaffAttendanceStatus;
      flags: string[];
      reviewState: string;
      lifecycle: string;
      checkInAt: Date | null;
      checkOutAt: Date | null;
      workingMinutes: number | null;
      leaveApplicationId: string | null;
      calendarEntryId: string | null;
    };
    institutionId: string;
    targetEventId?: string;
    adjustmentType: StaffAttendanceAdjustmentType;
    reasonCode: string;
    reasonText: string;
    requestedPayload: Prisma.InputJsonObject;
  }
) {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (input.record.lifecycle === "LOCKED") throw validationError("STAFF_ATTENDANCE_PERIOD_LOCKED");
  if (input.record.leaveApplicationId && input.adjustmentType !== "SET_ON_LEAVE") {
    throw validationError("STAFF_ATTENDANCE_MANAGED_BY_LEAVE");
  }
  if (input.record.calendarEntryId && !["SET_PRESENT", "SET_OFFICIAL_DUTY", "ADD_NOTE"].includes(input.adjustmentType)) {
    throw validationError("STAFF_ATTENDANCE_MANAGED_BY_CALENDAR");
  }

  if (input.targetEventId) {
    const target = await tx.staffAttendanceEvent.findFirst({
      where: {
        id: input.targetEventId,
        tenantId: ctx.tenantId,
        attendanceRecordId: input.record.id
      },
      select: { id: true, processingState: true }
    });
    if (!target || target.processingState === "VOIDED") {
      throw notFound("STAFF_ATTENDANCE_EVENT_NOT_FOUND");
    }
  }

  const beforeSnapshot: Prisma.InputJsonObject = {
    status: input.record.status,
    flags: input.record.flags,
    reviewState: input.record.reviewState,
    lifecycle: input.record.lifecycle,
    checkInAt: input.record.checkInAt?.toISOString() ?? null,
    checkOutAt: input.record.checkOutAt?.toISOString() ?? null,
    workingMinutes: input.record.workingMinutes
  };
  const adjustment = await tx.staffAttendanceAdjustment.create({
    data: {
      tenantId: ctx.tenantId,
      institutionId: input.institutionId,
      branchId: input.record.branchId,
      staffId: input.record.staffId,
      attendanceRecordId: input.record.id,
      targetEventId: input.targetEventId ?? null,
      adjustmentType: input.adjustmentType,
      status: "SUBMITTED",
      reasonCode: input.reasonCode,
      reasonText: input.reasonText,
      requestedPayload: input.requestedPayload,
      beforeSnapshot,
      requestedByUserId: ctx.userId
    }
  });
  await tx.staffAttendanceRecord.update({
    where: { id: input.record.id },
    data: {
      reviewState: "PENDING",
      lifecycle: "REVIEW_REQUIRED",
      reviewRequiredReason: input.reasonText,
      updatedById: ctx.userId
    }
  });
  await tx.staffAttendanceOutboxEvent.create({
    data: {
      tenantId: ctx.tenantId,
      domainEventId: adjustment.id,
      eventType: "staff.attendance.adjustment.requested",
      entityType: "StaffAttendanceAdjustment",
      entityId: adjustment.id,
      payloadJson: {
        adjustmentId: adjustment.id,
        attendanceRecordId: input.record.id,
        staffId: input.record.staffId,
        branchId: input.record.branchId,
        adjustmentType: input.adjustmentType
      }
    }
  });
  await writeAuditLog({
    ctx,
    action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_ADJUSTMENT_REQUESTED,
    entityType: "StaffAttendanceAdjustment",
    entityId: adjustment.id,
    branchId: input.record.branchId,
    before: beforeSnapshot,
    after: {
      status: adjustment.status,
      adjustmentType: adjustment.adjustmentType,
      reasonCode: adjustment.reasonCode
    },
    metadata: {
      attendanceRecordId: input.record.id,
      staffId: input.record.staffId,
      attendanceDate: staffAttendanceDateString(input.record.attendanceDate)
    }
  }, tx);
  return adjustment;
}

export async function requestStaffAttendanceAdjustment(ctx: TenantContext, input: unknown) {
  const data = requestStaffAttendanceAdjustmentSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const scope = await db.staffAttendanceRecord.findFirst({
    where: {
      id: data.attendanceRecordId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: { branchId: true, staffId: true }
  });
  if (!scope) throw notFound("STAFF_ATTENDANCE_RECORD_NOT_FOUND");
  await requireAdjustmentAccess(ctx, scope.branchId, "staffboard.attendance.adjustment.request");

  const ownStaffProfile = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      employmentStatus: "ACTIVE"
    },
    select: { id: true }
  });
  if (scope.staffId !== ownStaffProfile?.id) {
    await requireAdjustmentAccess(ctx, scope.branchId, "staffboard.attendance.correct");
  }

  return db.$transaction(async (tx) => {
    const record = await tx.staffAttendanceRecord.findFirst({
      where: { id: data.attendanceRecordId, tenantId: ctx.tenantId, branchId: scope.branchId },
      include: { branch: { select: { institutionId: true } } }
    });
    if (!record) throw notFound("STAFF_ATTENDANCE_RECORD_NOT_FOUND");
    await acquireStaffAttendanceDayLock(tx, ctx.tenantId, record.staffId, record.attendanceDate);
    return createAdjustment(tx, ctx, {
      record,
      institutionId: record.branch.institutionId,
      targetEventId: data.targetEventId,
      adjustmentType: data.adjustmentType,
      reasonCode: data.reasonCode,
      reasonText: data.reasonText,
      requestedPayload: {
        occurredAt: data.occurredAt?.toISOString() ?? null
      }
    });
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

export async function requestManualStaffAttendance(ctx: TenantContext, input: unknown) {
  const data = requestManualStaffAttendanceSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const branchId = resolveStaffAttendanceBranchId(ctx, data.branchId);
  await requireAdjustmentAccess(ctx, branchId, "staffboard.attendance.manual");

  return db.$transaction(async (tx) => {
    const [branch, setting, staff] = await Promise.all([
      tx.branch.findFirst({
        where: { id: branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true, institutionId: true }
      }),
      tx.attendanceSetting.findFirst({
        where: { tenantId: ctx.tenantId, branchId },
        select: { staffManualAttendanceEnabled: true }
      }),
      tx.staffProfile.findFirst({
        where: { id: data.staffId, tenantId: ctx.tenantId, employmentStatus: "ACTIVE" },
        select: { id: true }
      })
    ]);
    if (!branch) throw notFound("STAFF_ATTENDANCE_BRANCH_NOT_FOUND");
    if (!setting?.staffManualAttendanceEnabled) throw validationError("STAFF_ATTENDANCE_MANUAL_DISABLED");
    if (!staff) throw notFound("STAFF_PROFILE_NOT_FOUND");

    const assignment = await tx.staffBranchAssignment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        staffId: staff.id,
        branchId,
        effectiveFrom: { lte: data.attendanceDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: data.attendanceDate } }]
      },
      select: { id: true }
    });
    if (!assignment) throw new AppError("STAFF_ATTENDANCE_WRONG_BRANCH", "STAFF_ATTENDANCE_WRONG_BRANCH", 403);

    await acquireStaffAttendanceDayLock(tx, ctx.tenantId, staff.id, data.attendanceDate);
    const record = await tx.staffAttendanceRecord.upsert({
      where: {
        tenantId_branchId_staffId_attendanceDate: {
          tenantId: ctx.tenantId,
          branchId,
          staffId: staff.id,
          attendanceDate: data.attendanceDate
        }
      },
      update: {},
      create: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId: ctx.activeAcademicYearId,
        staffId: staff.id,
        attendanceDate: data.attendanceDate,
        status: "NOT_MARKED",
        lifecycle: "OPEN",
        markedById: ctx.userId,
        updatedById: ctx.userId
      }
    });
    return createAdjustment(tx, ctx, {
      record,
      institutionId: branch.institutionId,
      adjustmentType: adjustmentStatusForManual(data.status),
      reasonCode: data.reasonCode,
      reasonText: data.reasonText,
      requestedPayload: {
        requestedStatus: data.status,
        checkInAt: data.checkInAt?.toISOString() ?? null,
        checkOutAt: data.checkOutAt?.toISOString() ?? null
      }
    });
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

function adjustmentStatusForManual(status: StaffAttendanceStatus): StaffAttendanceAdjustmentType {
  if (status === "PRESENT") return "SET_PRESENT";
  if (status === "ABSENT") return "SET_ABSENT";
  if (status === "HALF_DAY") return "SET_HALF_DAY";
  if (status === "ON_LEAVE") return "SET_ON_LEAVE";
  if (status === "OFFICIAL_DUTY") return "SET_OFFICIAL_DUTY";
  throw validationError("STAFF_ATTENDANCE_MANUAL_STATUS_INVALID");
}

export async function reviewStaffAttendanceAdjustment(ctx: TenantContext, input: unknown) {
  const data = reviewStaffAttendanceAdjustmentSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const scope = await db.staffAttendanceAdjustment.findFirst({
    where: { id: data.adjustmentId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
    select: { branchId: true }
  });
  if (!scope) throw notFound("STAFF_ATTENDANCE_ADJUSTMENT_NOT_FOUND");
  await requireAdjustmentAccess(ctx, scope.branchId, "staffboard.attendance.adjustment.approve");

  return db.$transaction(async (tx) => {
    const adjustment = await tx.staffAttendanceAdjustment.findFirst({
      where: { id: data.adjustmentId, tenantId: ctx.tenantId, branchId: scope.branchId },
      include: {
        attendanceRecord: { include: { branch: { select: { timezone: true } } } },
        targetEvent: true
      }
    });
    if (!adjustment) throw notFound("STAFF_ATTENDANCE_ADJUSTMENT_NOT_FOUND");
    if (adjustment.status !== "SUBMITTED" && adjustment.status !== "UNDER_REVIEW") {
      throw validationError("STAFF_ATTENDANCE_ADJUSTMENT_ALREADY_REVIEWED");
    }
    if (adjustment.requestedByUserId === ctx.userId) {
      throw new AppError("STAFF_ATTENDANCE_MAKER_CHECKER_REQUIRED", "STAFF_ATTENDANCE_MAKER_CHECKER_REQUIRED", 403);
    }

    const record = adjustment.attendanceRecord;
    await acquireStaffAttendanceDayLock(tx, ctx.tenantId, record.staffId, record.attendanceDate);
    const reviewedAt = new Date();
    if (data.decision === "REJECT") {
      const rejected = await tx.staffAttendanceAdjustment.update({
        where: { id: adjustment.id },
        data: {
          status: "REJECTED",
          reviewedByUserId: ctx.userId,
          reviewedAt,
          reviewComment: data.reviewComment
        }
      });
      await tx.staffAttendanceRecord.update({
        where: { id: record.id },
        data: {
          reviewState: "REJECTED",
          lifecycle: "CALCULATED",
          reviewRequiredReason: null,
          updatedById: ctx.userId
        }
      });
      await tx.staffAttendanceOutboxEvent.create({
        data: {
          tenantId: ctx.tenantId,
          domainEventId: `${adjustment.id}:rejected`,
          eventType: "staff.attendance.adjustment.rejected",
          entityType: "StaffAttendanceAdjustment",
          entityId: adjustment.id,
          payloadJson: { adjustmentId: adjustment.id, staffId: record.staffId, branchId: record.branchId }
        }
      });
      await writeAuditLog({
        ctx,
        action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_ADJUSTMENT_REJECTED,
        entityType: "StaffAttendanceAdjustment",
        entityId: rejected.id,
        branchId: record.branchId,
        before: { status: adjustment.status },
        after: { status: rejected.status, reviewedAt },
        metadata: { attendanceRecordId: record.id, staffId: record.staffId, reviewComment: data.reviewComment }
      }, tx);
      return { adjustmentId: rejected.id, status: rejected.status, attendanceRecordId: record.id };
    }

    if (record.lifecycle === "LOCKED") throw validationError("STAFF_ATTENDANCE_PERIOD_LOCKED");
    const payload = jsonObject(adjustment.requestedPayload);
    let nextCheckInAt = record.checkInAt;
    let nextCheckOutAt = record.checkOutAt;
    let nextStatus = adjustmentStatus(adjustment.adjustmentType) ?? record.status;
    let eventType: "CHECK_IN" | "CHECK_OUT" | "MANUAL_STATUS" | "STATUS_OVERRIDE" | "EVENT_VOID" | "CORRECTION" = "CORRECTION";
    let occurredAt = reviewedAt;
    let supersedesEventId: string | null = null;

    if (adjustment.adjustmentType === "ADD_CHECK_IN") {
      nextCheckInAt = jsonDate(payload.occurredAt) ?? reviewedAt;
      eventType = "CHECK_IN";
      occurredAt = nextCheckInAt;
    } else if (adjustment.adjustmentType === "ADD_CHECK_OUT") {
      nextCheckOutAt = jsonDate(payload.occurredAt) ?? reviewedAt;
      eventType = "CHECK_OUT";
      occurredAt = nextCheckOutAt;
    } else if (adjustment.adjustmentType === "CORRECT_EVENT_TIME") {
      if (!adjustment.targetEvent) throw notFound("STAFF_ATTENDANCE_EVENT_NOT_FOUND");
      occurredAt = jsonDate(payload.occurredAt) ?? reviewedAt;
      supersedesEventId = adjustment.targetEvent.id;
      if (adjustment.targetEvent.eventType === "CHECK_IN") nextCheckInAt = occurredAt;
      if (adjustment.targetEvent.eventType === "CHECK_OUT") nextCheckOutAt = occurredAt;
      await tx.staffAttendanceEvent.update({
        where: { id: adjustment.targetEvent.id },
        data: { processingState: "SUPERSEDED" }
      });
    } else if (adjustment.adjustmentType === "VOID_EVENT") {
      if (!adjustment.targetEvent) throw notFound("STAFF_ATTENDANCE_EVENT_NOT_FOUND");
      supersedesEventId = adjustment.targetEvent.id;
      eventType = "EVENT_VOID";
      await tx.staffAttendanceEvent.update({
        where: { id: adjustment.targetEvent.id },
        data: { processingState: "VOIDED" }
      });
      const remaining = await tx.staffAttendanceEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          attendanceRecordId: record.id,
          processingState: "ACCEPTED",
          id: { not: adjustment.targetEvent.id },
          eventType: { in: ["CHECK_IN", "CHECK_OUT"] }
        },
        orderBy: { occurredAt: "asc" },
        select: { eventType: true, occurredAt: true }
      });
      nextCheckInAt = remaining.find((event) => event.eventType === "CHECK_IN")?.occurredAt ?? null;
      nextCheckOutAt = [...remaining].reverse().find((event) => event.eventType === "CHECK_OUT")?.occurredAt ?? null;
    } else if (adjustment.adjustmentType === "ADD_NOTE") {
      eventType = "CORRECTION";
    } else {
      eventType = "STATUS_OVERRIDE";
      nextCheckInAt = jsonDate(payload.checkInAt);
      nextCheckOutAt = jsonDate(payload.checkOutAt);
      if (["ABSENT", "ON_LEAVE", "OFFICIAL_DUTY"].includes(nextStatus)) {
        nextCheckInAt = null;
        nextCheckOutAt = null;
      }
    }

    if (nextCheckInAt && nextCheckOutAt && nextCheckOutAt < nextCheckInAt) {
      throw validationError("STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN");
    }
    const policy = await resolveStaffAttendanceProjectionPolicy(tx, {
      tenantId: ctx.tenantId,
      branchId: record.branchId,
      staffId: record.staffId,
      attendanceDate: record.attendanceDate,
      timeZone: record.branch.timezone
    });
    if (["ADD_CHECK_IN", "ADD_CHECK_OUT", "CORRECT_EVENT_TIME", "VOID_EVENT"].includes(adjustment.adjustmentType)) {
      const projection = calculateStaffAttendanceProjection({
        checkInAt: nextCheckInAt,
        checkOutAt: nextCheckOutAt,
        policy: policy.projection,
        preserveFlags: record.flags
      });
      nextStatus = projection.status;
    }
    const projection = calculateStaffAttendanceProjection({
      checkInAt: nextCheckInAt,
      checkOutAt: nextCheckOutAt,
      policy: policy.projection,
      preserveFlags: [...record.flags, "MANUAL_OVERRIDE", "MANUAL_ENTRY"]
    });
    const usesCalculatedStatus = ["ADD_CHECK_IN", "ADD_CHECK_OUT", "CORRECT_EVENT_TIME", "VOID_EVENT"].includes(adjustment.adjustmentType);

    const event = await tx.staffAttendanceEvent.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: adjustment.institutionId,
        branchId: record.branchId,
        staffId: record.staffId,
        attendanceRecordId: record.id,
        attendanceDate: record.attendanceDate,
        eventType,
        eventSource: "MANUAL",
        occurredAt,
        recordedAt: reviewedAt,
        recordedByUserId: ctx.userId,
        clientRequestId: randomUUID(),
        manualReasonCode: adjustment.reasonCode,
        manualReasonText: adjustment.reasonText,
        supersedesEventId,
        metadata: { adjustmentId: adjustment.id, adjustmentType: adjustment.adjustmentType }
      }
    });
    const updatedRecord = await tx.staffAttendanceRecord.update({
      where: { id: record.id },
      data: {
        status: usesCalculatedStatus ? projection.status : nextStatus,
        flags: projection.flags,
        reviewState: "APPROVED",
        lifecycle: "APPROVED",
        checkInAt: nextCheckInAt,
        checkOutAt: nextCheckOutAt,
        workingMinutes: projection.workingMinutes,
        lateMinutes: projection.lateMinutes,
        earlyDepartureMinutes: projection.earlyDepartureMinutes,
        checkInSource: nextCheckInAt ? "MANUAL_ADMIN" : null,
        checkOutSource: nextCheckOutAt ? "MANUAL_ADMIN" : null,
        policyId: policy.policyId,
        scheduleId: policy.scheduleId,
        updatedById: ctx.userId,
        approvedById: ctx.userId,
        approvedAt: reviewedAt,
        correctionReason: adjustment.reasonText,
        reviewRequiredReason: null,
        sourceSummary: { primary: "MANUAL", adjustmentId: adjustment.id },
        projectionVersion: { increment: 1 },
        lastCalculatedAt: reviewedAt
      }
    });
    const applied = await tx.staffAttendanceAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "APPLIED",
        appliedEventId: event.id,
        afterSnapshot: {
          status: updatedRecord.status,
          flags: updatedRecord.flags,
          checkInAt: updatedRecord.checkInAt?.toISOString() ?? null,
          checkOutAt: updatedRecord.checkOutAt?.toISOString() ?? null,
          workingMinutes: updatedRecord.workingMinutes
        },
        reviewedByUserId: ctx.userId,
        reviewedAt,
        reviewComment: data.reviewComment,
        appliedAt: reviewedAt
      }
    });
    await tx.staffAttendanceOutboxEvent.create({
      data: {
        tenantId: ctx.tenantId,
        domainEventId: event.id,
        eventType: "staff.attendance.adjustment.applied",
        entityType: "StaffAttendanceEvent",
        entityId: event.id,
        payloadJson: {
          adjustmentId: adjustment.id,
          attendanceRecordId: record.id,
          staffId: record.staffId,
          branchId: record.branchId,
          status: updatedRecord.status
        }
      }
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_ADJUSTMENT_APPROVED,
      entityType: "StaffAttendanceAdjustment",
      entityId: applied.id,
      branchId: record.branchId,
      before: adjustment.beforeSnapshot,
      after: applied.afterSnapshot,
      metadata: {
        attendanceRecordId: record.id,
        staffId: record.staffId,
        appliedEventId: event.id,
        adjustmentType: adjustment.adjustmentType,
        reviewComment: data.reviewComment
      }
    }, tx);
    return {
      adjustmentId: applied.id,
      status: applied.status,
      attendanceRecordId: record.id,
      attendanceStatus: updatedRecord.status,
      appliedEventId: event.id
    };
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

export async function listPendingStaffAttendanceAdjustments(
  ctx: TenantContext,
  input: { branchId?: string; take?: number } = {}
) {
  const branchId = resolveStaffAttendanceBranchId(ctx, input.branchId);
  await requirePermission({ ctx, permission: "staffboard.attendance.adjustment.approve", branchId });
  await requireStaffAttendanceFeature(
    ctx,
    branchId,
    ATTENDANCE_ENTITLEMENT_FEATURES.APPROVAL_AUDIT,
    "READ"
  );
  return db.staffAttendanceAdjustment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] }
    },
    orderBy: { requestedAt: "asc" },
    take: Math.min(100, Math.max(1, input.take ?? 50)),
    include: {
      staff: {
        select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true }
      },
      attendanceRecord: {
        select: { attendanceDate: true, status: true, checkInAt: true, checkOutAt: true }
      },
      requestedBy: { select: { id: true, displayName: true, firstName: true, lastName: true } }
    }
  });
}
export async function listManualStaffAttendanceOptions(ctx: TenantContext, requestedBranchId?: string) {
  const branchId = resolveStaffAttendanceBranchId(ctx, requestedBranchId);
  await requireAdjustmentAccess(ctx, branchId, "staffboard.attendance.manual");
  const [branch, staff] = await Promise.all([
    db.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, code: true, timezone: true }
    }),
    db.staffProfile.findMany({
      where: { tenantId: ctx.tenantId, branchId, employmentStatus: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { employeeCode: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        designation: true,
        staffType: true
      }
    })
  ]);
  if (!branch) throw notFound("STAFF_ATTENDANCE_BRANCH_NOT_FOUND");
  return { branch, staff };
}