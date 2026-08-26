import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";
import { staffCalendarAudience } from "@/modules/campus-core/calendar/calendar-utils";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  closeStaffAttendanceScanSessionSchema,
  recordSupervisedStaffQrScanSchema,
  startStaffAttendanceScanSessionSchema
} from "@/modules/staffboard-lite/schemas";
import {
  calculateStaffAttendanceProjection,
  inferNextStaffAttendanceEvent
} from "@/modules/staffboard-lite/utils/staff-attendance-projection";
import {
  acquireStaffAttendanceDayLock,
  hashStaffAttendanceCredential,
  loadActiveStaffAttendanceBranch,
  mergeStaffAttendanceFlags,
  parseStaffAttendanceCredentialPayload,
  requireStaffAttendanceFeature,
  resolveStaffAttendanceBranchId,
  resolveStaffAttendanceProjectionPolicy,
  STAFF_ATTENDANCE_TRANSACTION_OPTIONS,
  staffAttendanceDateForBranch,
  staffAttendanceDateString,
  staffAttendanceDisplayName
} from "./staff-attendance-domain.shared";
import { validationError } from "./shared";

function hashRequestContext(value: string | null | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

function mapInferenceError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith("STAFF_")) {
    throw validationError(error.message);
  }
  throw error;
}

export async function startStaffAttendanceScanSession(ctx: TenantContext, input: unknown) {
  const data = startStaffAttendanceScanSessionSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const branchId = resolveStaffAttendanceBranchId(ctx, data.branchId);
  await requirePermission({ ctx, permission: "staffboard.attendance.scan", branchId });
  await requireStaffAttendanceFeature(ctx, branchId, ATTENDANCE_ENTITLEMENT_FEATURES.QR, "WRITE");
  const branch = await loadActiveStaffAttendanceBranch(db, ctx, branchId);

  const now = new Date();
  return db.$transaction(async (tx) => {
    const setting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId },
      select: {
        staffQrAttendanceEnabled: true,
        staffAttendanceCaptureMode: true,
        staffScanSessionValidityMinutes: true
      }
    });
    if (!setting?.staffQrAttendanceEnabled || setting.staffAttendanceCaptureMode === "MANUAL_ONLY") {
      throw validationError("STAFF_ATTENDANCE_QR_DISABLED");
    }

    await tx.staffAttendanceScanSession.updateMany({
      where: {
        tenantId: ctx.tenantId,
        operatorUserId: ctx.userId,
        status: "ACTIVE"
      },
      data: {
        status: "CLOSED",
        closedAt: now,
        closedById: ctx.userId,
        closeReason: "New scanner session started"
      }
    });

    const validityMinutes = Math.min(480, Math.max(5, setting.staffScanSessionValidityMinutes));
    const session = await tx.staffAttendanceScanSession.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: branch.institutionId,
        branchId,
        operatorUserId: ctx.userId,
        mode: data.mode,
        status: "ACTIVE",
        startedAt: now,
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + validityMinutes * 60_000),
        createdIpHash: hashRequestContext(ctx.ipAddress),
        userAgentSummary: ctx.userAgent?.slice(0, 250) ?? null
      },
      select: { id: true, branchId: true, mode: true, status: true, startedAt: true, expiresAt: true }
    });

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_SCAN_SESSION_STARTED,
      entityType: "StaffAttendanceScanSession",
      entityId: session.id,
      branchId,
      after: session,
      metadata: { captureMode: setting.staffAttendanceCaptureMode }
    }, tx);
    return session;
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

export async function closeStaffAttendanceScanSession(ctx: TenantContext, input: unknown) {
  const data = closeStaffAttendanceScanSessionSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const session = await db.staffAttendanceScanSession.findFirst({
    where: { id: data.sessionId, tenantId: ctx.tenantId, operatorUserId: ctx.userId },
    select: { id: true, branchId: true, status: true }
  });
  if (!session) throw notFound("STAFF_ATTENDANCE_SCAN_SESSION_NOT_FOUND");
  await requirePermission({ ctx, permission: "staffboard.attendance.scan", branchId: session.branchId });

  const now = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.staffAttendanceScanSession.update({
      where: { id: session.id },
      data: {
        status: session.status === "ACTIVE" ? "CLOSED" : session.status,
        closedAt: session.status === "ACTIVE" ? now : undefined,
        closedById: session.status === "ACTIVE" ? ctx.userId : undefined,
        closeReason: session.status === "ACTIVE" ? data.reason ?? "Operator closed scanner" : undefined
      },
      select: { id: true, branchId: true, status: true, closedAt: true }
    });
    if (session.status === "ACTIVE") {
      await writeAuditLog({
        ctx,
        action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_SCAN_SESSION_CLOSED,
        entityType: "StaffAttendanceScanSession",
        entityId: updated.id,
        branchId: updated.branchId,
        before: { status: session.status },
        after: updated,
        metadata: { reason: data.reason ?? null }
      }, tx);
    }
    return updated;
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

export type SupervisedStaffScanResult = {
  eventId: string;
  attendanceRecordId: string;
  attendanceDate: string;
  eventType: "CHECK_IN" | "CHECK_OUT";
  status: string;
  staffId: string;
  staffName: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  occurredAt: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  flags: string[];
  duplicateRequest: boolean;
};

function safeScanResult(input: {
  event: { id: string; eventType: string; occurredAt: Date };
  record: {
    id: string;
    attendanceDate: Date;
    status: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    workingMinutes: number | null;
    flags: string[];
  };
  staff: {
    id: string;
    employeeCode: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
  };
  branchId: string;
  branchName: string;
  duplicateRequest: boolean;
}): SupervisedStaffScanResult {
  return {
    eventId: input.event.id,
    attendanceRecordId: input.record.id,
    attendanceDate: staffAttendanceDateString(input.record.attendanceDate),
    eventType: input.event.eventType as "CHECK_IN" | "CHECK_OUT",
    status: input.record.status,
    staffId: input.staff.id,
    staffName: staffAttendanceDisplayName(input.staff),
    employeeCode: input.staff.employeeCode,
    branchId: input.branchId,
    branchName: input.branchName,
    occurredAt: input.event.occurredAt.toISOString(),
    checkInAt: input.record.checkInAt?.toISOString() ?? null,
    checkOutAt: input.record.checkOutAt?.toISOString() ?? null,
    workingMinutes: input.record.workingMinutes,
    flags: input.record.flags,
    duplicateRequest: input.duplicateRequest
  };
}

export async function recordSupervisedStaffQrScan(
  ctx: TenantContext,
  input: unknown
): Promise<SupervisedStaffScanResult> {
  const data = recordSupervisedStaffQrScanSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const sessionScope = await db.staffAttendanceScanSession.findFirst({
    where: { id: data.sessionId, tenantId: ctx.tenantId, operatorUserId: ctx.userId },
    select: { id: true, branchId: true }
  });
  if (!sessionScope) throw notFound("STAFF_ATTENDANCE_SCAN_SESSION_NOT_FOUND");
  await requirePermission({ ctx, permission: "staffboard.attendance.scan", branchId: sessionScope.branchId });
  await requireStaffAttendanceFeature(
    ctx,
    sessionScope.branchId,
    ATTENDANCE_ENTITLEMENT_FEATURES.QR,
    "WRITE"
  );

  const rawToken = parseStaffAttendanceCredentialPayload(data.qrPayload);
  const tokenHash = hashStaffAttendanceCredential(rawToken);
  const now = new Date();

  return db.$transaction(async (tx) => {
    const session = await tx.staffAttendanceScanSession.findFirst({
      where: {
        id: data.sessionId,
        tenantId: ctx.tenantId,
        operatorUserId: ctx.userId
      },
      include: { branch: { select: { id: true, name: true, institutionId: true, timezone: true, status: true } } }
    });
    if (!session || session.branch.status !== "ACTIVE") {
      throw notFound("STAFF_ATTENDANCE_SCAN_SESSION_NOT_FOUND");
    }
    if (session.status !== "ACTIVE" || session.expiresAt <= now) {
      if (session.status === "ACTIVE") {
        await tx.staffAttendanceScanSession.update({
          where: { id: session.id },
          data: { status: "EXPIRED", closedAt: now, closeReason: "Scanner session expired" }
        });
      }
      throw validationError("STAFF_ATTENDANCE_SCAN_SESSION_EXPIRED");
    }

    const duplicate = await tx.staffAttendanceEvent.findUnique({
      where: {
        tenantId_clientRequestId: {
          tenantId: ctx.tenantId,
          clientRequestId: data.clientRequestId
        }
      },
      include: {
        attendanceRecord: true,
        staff: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            middleName: true,
            lastName: true
          }
        }
      }
    });
    if (duplicate) {
      if (duplicate.scanSessionId !== session.id) throw validationError("STAFF_ATTENDANCE_REQUEST_CONFLICT");
      return safeScanResult({
        event: duplicate,
        record: duplicate.attendanceRecord,
        staff: duplicate.staff,
        branchId: session.branchId,
        branchName: session.branch.name,
        duplicateRequest: true
      });
    }

    const credential = await tx.staffAttendanceCredential.findFirst({
      where: { tenantId: ctx.tenantId, tokenHash },
      include: {
        staff: {
          select: {
            id: true,
            tenantId: true,
            branchId: true,
            employeeCode: true,
            firstName: true,
            middleName: true,
            lastName: true,
            staffType: true,
            employmentStatus: true
          }
        }
      }
    });
    if (!credential || credential.institutionId !== session.institutionId) {
      throw validationError("STAFF_ATTENDANCE_QR_INVALID");
    }
    if (credential.status !== "ACTIVE") throw validationError("STAFF_ATTENDANCE_CREDENTIAL_INACTIVE");
    if (credential.expiresAt && credential.expiresAt <= now) {
      await tx.staffAttendanceCredential.update({
        where: { id: credential.id },
        data: { status: "EXPIRED" }
      });
      throw validationError("STAFF_ATTENDANCE_CREDENTIAL_EXPIRED");
    }
    if (credential.staff.employmentStatus !== "ACTIVE") {
      throw validationError("STAFF_ATTENDANCE_STAFF_INACTIVE");
    }

    const attendanceDate = staffAttendanceDateForBranch(now, session.branch.timezone);
    const assignment = await tx.staffBranchAssignment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        staffId: credential.staff.id,
        branchId: session.branchId,
        effectiveFrom: { lte: attendanceDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: attendanceDate } }]
      },
      select: { id: true }
    });
    if (!assignment) throw new AppError("STAFF_ATTENDANCE_WRONG_BRANCH", "STAFF_ATTENDANCE_WRONG_BRANCH", 403);

    const setting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId: session.branchId },
      select: { staffQrAttendanceEnabled: true, staffAttendanceCaptureMode: true }
    });
    if (!setting?.staffQrAttendanceEnabled || setting.staffAttendanceCaptureMode === "MANUAL_ONLY") {
      throw validationError("STAFF_ATTENDANCE_QR_DISABLED");
    }

    await acquireStaffAttendanceDayLock(tx, ctx.tenantId, credential.staff.id, attendanceDate);
    const policy = await resolveStaffAttendanceProjectionPolicy(tx, {
      tenantId: ctx.tenantId,
      branchId: session.branchId,
      staffId: credential.staff.id,
      attendanceDate,
      timeZone: session.branch.timezone
    });
    const existing = await tx.staffAttendanceRecord.findUnique({
      where: {
        tenantId_branchId_staffId_attendanceDate: {
          tenantId: ctx.tenantId,
          branchId: session.branchId,
          staffId: credential.staff.id,
          attendanceDate
        }
      }
    });
    if (existing?.lifecycle === "LOCKED") throw validationError("STAFF_ATTENDANCE_PERIOD_LOCKED");
    if (existing?.leaveApplicationId) throw validationError("STAFF_ATTENDANCE_MANAGED_BY_LEAVE");

    const lastEvent = await tx.staffAttendanceEvent.findFirst({
      where: {
        tenantId: ctx.tenantId,
        staffId: credential.staff.id,
        attendanceDate,
        processingState: "ACCEPTED"
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true }
    });
    if (lastEvent && now.getTime() - lastEvent.occurredAt.getTime() < policy.duplicateCooldownSeconds * 1000) {
      throw validationError("STAFF_ATTENDANCE_SCAN_TOO_SOON");
    }

    let eventType: "CHECK_IN" | "CHECK_OUT";
    try {
      eventType = inferNextStaffAttendanceEvent({
        mode: session.mode,
        hasCheckIn: Boolean(existing?.checkInAt),
        hasCheckOut: Boolean(existing?.checkOutAt)
      });
    } catch (error) {
      mapInferenceError(error);
    }

    const calendarEntry = ctx.activeAcademicYearId
      ? await findApplicableCalendarEntry(tx, {
          tenantId: ctx.tenantId,
          institutionId: session.institutionId,
          branchId: session.branchId,
          academicYearId: ctx.activeAcademicYearId,
          attendanceDate,
          audience: staffCalendarAudience(credential.staff.staffType)
        })
      : null;
    const workedOnNonWorkingDay = Boolean(calendarEntry);
    const nextCheckInAt = eventType === "CHECK_IN" ? now : existing?.checkInAt ?? null;
    const nextCheckOutAt = eventType === "CHECK_OUT" ? now : existing?.checkOutAt ?? null;
    const projection = calculateStaffAttendanceProjection({
      checkInAt: nextCheckInAt,
      checkOutAt: nextCheckOutAt,
      policy: policy.projection,
      preserveFlags: mergeStaffAttendanceFlags(
        existing?.flags ?? [],
        workedOnNonWorkingDay ? ["WORKED_ON_NON_WORKING_DAY"] : []
      )
    });
    const reviewRequired = workedOnNonWorkingDay;

    const record = existing
      ? await tx.staffAttendanceRecord.update({
          where: { id: existing.id },
          data: {
            academicYearId: ctx.activeAcademicYearId,
            status: projection.status,
            flags: projection.flags,
            reviewState: reviewRequired ? "PENDING" : existing.reviewState,
            lifecycle: reviewRequired ? "REVIEW_REQUIRED" : "CALCULATED",
            checkInAt: nextCheckInAt,
            checkOutAt: nextCheckOutAt,
            workingMinutes: projection.workingMinutes,
            lateMinutes: projection.lateMinutes,
            earlyDepartureMinutes: projection.earlyDepartureMinutes,
            checkInSource: eventType === "CHECK_IN" ? "QR_SCAN" : existing.checkInSource,
            checkOutSource: eventType === "CHECK_OUT" ? "QR_SCAN" : existing.checkOutSource,
            policyId: policy.policyId,
            scheduleId: policy.scheduleId,
            markedById: existing.markedById ?? ctx.userId,
            updatedById: ctx.userId,
            calendarEntryId: calendarEntry?.id ?? existing.calendarEntryId,
            reviewRequiredReason: reviewRequired ? "Worked on a non-working day" : existing.reviewRequiredReason,
            sourceSummary: { primary: "SUPERVISED_STATIC_QR", scanSessionId: session.id },
            projectionVersion: { increment: 1 },
            lastCalculatedAt: now
          }
        })
      : await tx.staffAttendanceRecord.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: session.branchId,
            academicYearId: ctx.activeAcademicYearId,
            staffId: credential.staff.id,
            attendanceDate,
            status: projection.status,
            flags: projection.flags,
            reviewState: reviewRequired ? "PENDING" : "NOT_REQUIRED",
            lifecycle: reviewRequired ? "REVIEW_REQUIRED" : "CALCULATED",
            checkInAt: nextCheckInAt,
            checkOutAt: nextCheckOutAt,
            workingMinutes: projection.workingMinutes,
            lateMinutes: projection.lateMinutes,
            earlyDepartureMinutes: projection.earlyDepartureMinutes,
            checkInSource: eventType === "CHECK_IN" ? "QR_SCAN" : null,
            checkOutSource: eventType === "CHECK_OUT" ? "QR_SCAN" : null,
            policyId: policy.policyId,
            scheduleId: policy.scheduleId,
            markedById: ctx.userId,
            updatedById: ctx.userId,
            calendarEntryId: calendarEntry?.id ?? null,
            reviewRequiredReason: reviewRequired ? "Worked on a non-working day" : null,
            sourceSummary: { primary: "SUPERVISED_STATIC_QR", scanSessionId: session.id },
            lastCalculatedAt: now
          }
        });

    const event = await tx.staffAttendanceEvent.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: session.institutionId,
        branchId: session.branchId,
        staffId: credential.staff.id,
        attendanceRecordId: record.id,
        attendanceDate,
        eventType,
        eventSource: "SUPERVISED_STATIC_QR",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: ctx.userId,
        scanSessionId: session.id,
        credentialId: credential.id,
        clientRequestId: data.clientRequestId,
        metadata: {
          mode: session.mode,
          policyId: policy.policyId,
          scheduleId: policy.scheduleId,
          workedOnNonWorkingDay
        }
      }
    });

    await Promise.all([
      tx.staffAttendanceCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: now }
      }),
      tx.staffAttendanceScanSession.update({
        where: { id: session.id },
        data: { lastActivityAt: now }
      }),
      tx.staffAttendanceOutboxEvent.create({
        data: {
          tenantId: ctx.tenantId,
          domainEventId: event.id,
          eventType: "staff.attendance.recorded",
          entityType: "StaffAttendanceEvent",
          entityId: event.id,
          payloadJson: {
            eventId: event.id,
            staffId: credential.staff.id,
            branchId: session.branchId,
            attendanceDate: staffAttendanceDateString(attendanceDate),
            eventType,
            status: record.status
          }
        }
      })
    ]);

    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_EVENT_RECORDED,
      entityType: "StaffAttendanceEvent",
      entityId: event.id,
      branchId: session.branchId,
      academicYearId: ctx.activeAcademicYearId,
      after: {
        eventId: event.id,
        attendanceRecordId: record.id,
        staffId: credential.staff.id,
        eventType,
        occurredAt: now,
        status: record.status
      },
      metadata: {
        source: "SUPERVISED_STATIC_QR",
        scanSessionId: session.id,
        credentialVersion: credential.credentialVersion,
        workedOnNonWorkingDay
      }
    }, tx);

    return safeScanResult({
      event,
      record,
      staff: credential.staff,
      branchId: session.branchId,
      branchName: session.branch.name,
      duplicateRequest: false
    });
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}
export async function listStaffAttendanceOperatorBranchOptions(ctx: TenantContext) {
  if (ctx.accessibleBranchIds.length === 0) return [];
  const branches = await db.branch.findMany({
    where: {
      tenantId: ctx.tenantId,
      id: { in: ctx.accessibleBranchIds },
      status: "ACTIVE"
    },
    select: { id: true, name: true, code: true, timezone: true },
    orderBy: [{ name: "asc" }, { code: "asc" }]
  });
  const allowed = [];
  for (const branch of branches) {
    try {
      await requirePermission({ ctx, permission: "staffboard.attendance.scan", branchId: branch.id });
      await requireStaffAttendanceFeature(ctx, branch.id, ATTENDANCE_ENTITLEMENT_FEATURES.QR, "WRITE");
      allowed.push(branch);
    } catch (error) {
      if (error instanceof AppError && error.status === 403) continue;
      if (error instanceof Error && error.message.startsWith("FORBIDDEN_")) continue;
      throw error;
    }
  }
  return allowed;
}
export async function getStaffAttendanceCaptureSetting(ctx: TenantContext, branchId: string) {
  if (!ctx.accessibleBranchIds.includes(branchId)) {
    throw new AppError("FORBIDDEN_BRANCH_ACCESS", "FORBIDDEN_BRANCH_ACCESS", 403);
  }
  return db.attendanceSetting.findFirst({
    where: { tenantId: ctx.tenantId, branchId },
    select: {
      staffQrAttendanceEnabled: true,
      staffAttendanceCaptureMode: true,
      staffSelfScanEnabled: true,
      staffManualAttendanceEnabled: true
    }
  });
}