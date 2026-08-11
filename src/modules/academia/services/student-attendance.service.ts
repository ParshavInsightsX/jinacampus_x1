import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";
import {
  autoLockStudentAttendanceSchema,
  correctStudentAttendanceSchema,
  submitStudentAttendanceSchema
} from "@/modules/academia/schemas";
import { queueStudentAttendanceWhatsAppNotifications } from "@/modules/notifications/services/attendance-whatsapp-notification.service";
import { processNotificationOutbox } from "@/modules/notifications/services/notification-outbox.service";
import { conflict, validationError } from "./shared";

type SubmittedAttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_LEAVE" | "EXCUSED";
type AttendanceLockClient = Prisma.TransactionClient;

const DEFAULT_STUDENT_AUTO_LOCK_TIME = "15:00";
const DEFAULT_ATTENDANCE_TIME_ZONE = "Asia/Kolkata";
const cutoffTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SubmitDailyStudentAttendanceResult = {
  classSectionId: string;
  attendanceDate: string;
  sessionType: "FULL_DAY";
  totalActiveStudents: number;
  submittedCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  halfDayCount: number;
  onLeaveCount: number;
  excusedCount: number;
  updatedCount: number;
  createdCount: number;
  attendanceRecordIds: string[];
};

export type AutoLockStudentAttendanceResult = {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  attendanceDate: string;
  sessionType: "FULL_DAY";
  autoLockEnabled: boolean;
  cutoffTime: string | null;
  timeZone: string;
  cutoffPassed: boolean;
  lockedCount: number;
  alreadyLockedCount: number;
  skippedCount: number;
};

export type CorrectStudentAttendanceResult = {
  attendanceRecordId: string;
  studentId: string;
  classSectionId: string;
  attendanceDate: string;
  sessionType: "FULL_DAY";
  previousStatus: string;
  newStatus: string;
  correctionReason: string;
  correctedById: string;
  lockedAt: string | null;
};

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function incrementStatusCount(result: SubmitDailyStudentAttendanceResult, status: SubmittedAttendanceStatus) {
  switch (status) {
    case "PRESENT":
      result.presentCount += 1;
      break;
    case "ABSENT":
      result.absentCount += 1;
      break;
    case "LATE":
      result.lateCount += 1;
      break;
    case "HALF_DAY":
      result.halfDayCount += 1;
      break;
    case "ON_LEAVE":
      result.onLeaveCount += 1;
      break;
    case "EXCUSED":
      result.excusedCount += 1;
      break;
  }
}

function mapPrismaUniqueConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw conflict("STUDENT_ATTENDANCE_ALREADY_EXISTS");
  }
  throw error;
}

function parseCutoffTime(value: string | null | undefined) {
  const cutoffTime = value?.trim() || DEFAULT_STUDENT_AUTO_LOCK_TIME;
  if (!cutoffTimePattern.test(cutoffTime)) {
    throw validationError("INVALID_STUDENT_AUTO_LOCK_TIME");
  }
  return cutoffTime;
}

function safeTimeZone(value: string | null | undefined) {
  const timeZone = value?.trim() || DEFAULT_ATTENDANCE_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_ATTENDANCE_TIME_ZONE;
  }
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

function zonedCutoffToUtc(attendanceDate: Date, cutoffTime: string, timeZone: string) {
  const [hour, minute] = cutoffTime.split(":").map(Number);
  const targetUtcMs = Date.UTC(
    attendanceDate.getUTCFullYear(),
    attendanceDate.getUTCMonth(),
    attendanceDate.getUTCDate(),
    hour,
    minute,
    0,
    0
  );
  let candidateUtcMs = targetUtcMs;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const localParts = zonedParts(new Date(candidateUtcMs), timeZone);
    const localAsUtcMs = Date.UTC(
      localParts.year,
      localParts.month - 1,
      localParts.day,
      localParts.hour,
      localParts.minute,
      localParts.second,
      0
    );
    const offsetMs = localAsUtcMs - candidateUtcMs;
    const nextCandidateUtcMs = targetUtcMs - offsetMs;
    if (Math.abs(nextCandidateUtcMs - candidateUtcMs) < 1000) break;
    candidateUtcMs = nextCandidateUtcMs;
  }

  return new Date(candidateUtcMs);
}

function hasCutoffPassed(attendanceDate: Date, cutoffTime: string, timeZone: string, now = new Date()) {
  return now >= zonedCutoffToUtc(attendanceDate, cutoffTime, timeZone);
}

async function loadAutoLockPolicy(tx: AttendanceLockClient, ctx: TenantContext, branchId: string) {
  const branch = await tx.branch.findFirst({
    where: { id: branchId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } },
    select: { id: true, timezone: true }
  });
  if (!branch) throw notFound("BRANCH_NOT_FOUND");

  const attendanceSetting = await tx.attendanceSetting.findFirst({
    where: { tenantId: ctx.tenantId, branchId },
    select: { studentAutoLockEnabled: true, studentAutoLockTime: true }
  });

  const cutoffTime = parseCutoffTime(attendanceSetting?.studentAutoLockTime);
  return {
    autoLockEnabled: attendanceSetting?.studentAutoLockEnabled ?? true,
    cutoffTime,
    timeZone: safeTimeZone(branch.timezone)
  };
}

async function queueAndDispatchStudentAttendanceNotifications(
  ctx: TenantContext,
  input: {
    branchId: string;
    academicYearId: string;
    classSectionId: string;
    attendanceDate: Date;
    attendanceRecordIds: string[];
  }
) {
  const queued = await queueStudentAttendanceWhatsAppNotifications({
    tenantId: ctx.tenantId,
    branchId: input.branchId,
    academicYearId: input.academicYearId,
    classSectionId: input.classSectionId,
    attendanceDate: input.attendanceDate,
    attendanceRecordIds: input.attendanceRecordIds,
    actorUserId: ctx.userId
  });
  if (queued.queued > 0) {
    await processNotificationOutbox({
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      limit: Math.min(Math.max(queued.queued, 1), 100)
    });
  }
}

async function lockStudentAttendanceRecordsForScope(
  tx: AttendanceLockClient,
  ctx: TenantContext,
  input: {
    branchId: string;
    academicYearId: string;
    attendanceDate: Date;
    classSectionId?: string;
  }
): Promise<AutoLockStudentAttendanceResult> {
  const { branchId, academicYearId, classSectionId } = input;
  const attendanceDate = normalizeDateOnly(input.attendanceDate);
  const policy = await loadAutoLockPolicy(tx, ctx, branchId);
  const cutoffPassed = hasCutoffPassed(attendanceDate, policy.cutoffTime, policy.timeZone);
  const baseResult: AutoLockStudentAttendanceResult = {
    tenantId: ctx.tenantId,
    branchId,
    academicYearId,
    attendanceDate: toDateOnlyString(attendanceDate),
    sessionType: "FULL_DAY",
    autoLockEnabled: policy.autoLockEnabled,
    cutoffTime: policy.cutoffTime,
    timeZone: policy.timeZone,
    cutoffPassed,
    lockedCount: 0,
    alreadyLockedCount: 0,
    skippedCount: 0
  };

  if (classSectionId) {
    const classSection = await tx.classSection.findFirst({
      where: {
        id: classSectionId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!classSection) throw notFound("CLASS_SECTION_NOT_FOUND");
  }

  if (!policy.autoLockEnabled || !cutoffPassed) {
    return baseResult;
  }

  const attendanceRecords = await tx.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      attendanceDate,
      sessionType: "FULL_DAY" as const,
      ...(classSectionId ? { classSectionId } : {})
    },
    select: { id: true, lockedAt: true }
  });

  const unlockedRecordIds = attendanceRecords.filter((record) => !record.lockedAt).map((record) => record.id);
  const alreadyLockedCount = attendanceRecords.length - unlockedRecordIds.length;
  if (unlockedRecordIds.length === 0) {
    return { ...baseResult, alreadyLockedCount };
  }

  const lockedAt = new Date();
  const updateResult = await tx.studentAttendanceRecord.updateMany({
    where: {
      id: { in: unlockedRecordIds },
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      attendanceDate,
      sessionType: "FULL_DAY",
      lockedAt: null
    },
    data: { lockedAt }
  });

  const result = {
    ...baseResult,
    lockedCount: updateResult.count,
    alreadyLockedCount,
    skippedCount: unlockedRecordIds.length - updateResult.count
  };

  if (updateResult.count > 0) {
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_LOCKED,
      entityType: "StudentAttendanceRecordBatch",
      entityId: null,
      branchId,
      academicYearId,
      metadata: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        classSectionId: classSectionId ?? null,
        attendanceDate: result.attendanceDate,
        sessionType: "FULL_DAY",
        lockedRecordIds: unlockedRecordIds.slice(0, updateResult.count),
        lockedCount: updateResult.count,
        alreadyLockedCount,
        cutoffTime: policy.cutoffTime,
        timeZone: policy.timeZone,
        lockedAt: lockedAt.toISOString()
      }
    }, tx);
  }

  return result;
}

export async function autoLockStudentAttendanceForDate(
  ctx: TenantContext,
  input: unknown
): Promise<AutoLockStudentAttendanceResult> {
  const data = autoLockStudentAttendanceSchema.parse(input);
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  const attendanceDate = normalizeDateOnly(data.attendanceDate);

  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (!branchId) throw validationError("ACTIVE_BRANCH_REQUIRED");
  if (!academicYearId) throw validationError("ACTIVE_ACADEMIC_YEAR_REQUIRED");
  if (data.sessionType !== "FULL_DAY") throw validationError("UNSUPPORTED_ATTENDANCE_SESSION_TYPE");

  return db.$transaction(async (tx) => {
    await requirePermission({
      ctx,
      permission: "academia.attendance.lock",
      branchId,
      academicYearId
    });

    return lockStudentAttendanceRecordsForScope(tx, ctx, {
      branchId,
      academicYearId,
      attendanceDate,
      classSectionId: data.classSectionId
    });
  });
}

export async function correctStudentAttendance(
  ctx: TenantContext,
  input: unknown
): Promise<CorrectStudentAttendanceResult> {
  const data = correctStudentAttendanceSchema.parse(input);
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  const correctedAt = new Date();

  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (!branchId) throw validationError("ACTIVE_BRANCH_REQUIRED");
  if (!academicYearId) throw validationError("ACTIVE_ACADEMIC_YEAR_REQUIRED");

  const result = await db.$transaction(async (tx) => {
    await requirePermission({
      ctx,
      permission: "academia.attendance.correct",
      branchId,
      academicYearId
    });

    const before = await tx.studentAttendanceRecord.findFirst({
      where: {
        id: data.attendanceRecordId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        sessionType: "FULL_DAY"
      }
    });
    if (!before) throw notFound("STUDENT_ATTENDANCE_RECORD_NOT_FOUND");
    const holiday = await findApplicableCalendarEntry(tx, {
      tenantId: ctx.tenantId,
      branchId: before.branchId,
      academicYearId: before.academicYearId,
      attendanceDate: before.attendanceDate,
      audience: "STUDENTS"
    });
    if (holiday) throw validationError("STUDENT_ATTENDANCE_HOLIDAY");

    const after = await tx.studentAttendanceRecord.update({
      where: { id: before.id },
      data: {
        status: data.status,
        remarks: data.remarks ?? before.remarks,
        correctionReason: data.correctionReason,
        correctedById: ctx.userId,
        correctedAt
      }
    });

    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_CORRECTED,
      entityType: "StudentAttendanceRecord",
      entityId: after.id,
      branchId: after.branchId,
      academicYearId: after.academicYearId,
      before,
      after,
      metadata: {
        tenantId: ctx.tenantId,
        branchId: after.branchId,
        academicYearId: after.academicYearId,
        attendanceRecordId: after.id,
        studentId: after.studentId,
        classSectionId: after.classSectionId,
        attendanceDate: toDateOnlyString(after.attendanceDate),
        sessionType: after.sessionType,
        previousStatus: before.status,
        newStatus: after.status,
        previousRemarks: before.remarks,
        newRemarks: after.remarks,
        correctionReason: after.correctionReason,
        correctedById: ctx.userId,
        lockedAt: after.lockedAt?.toISOString() ?? null
      }
    }, tx);

    return {
      attendanceRecordId: after.id,
      studentId: after.studentId,
      classSectionId: after.classSectionId,
      attendanceDate: toDateOnlyString(after.attendanceDate),
      sessionType: "FULL_DAY" as const,
      previousStatus: before.status,
      newStatus: after.status,
      correctionReason: data.correctionReason,
      correctedById: ctx.userId,
      lockedAt: after.lockedAt?.toISOString() ?? null
    };
  });

  await queueAndDispatchStudentAttendanceNotifications(ctx, {
    branchId,
    academicYearId,
    classSectionId: result.classSectionId,
    attendanceDate: new Date(`${result.attendanceDate}T00:00:00.000Z`),
    attendanceRecordIds: [result.attendanceRecordId]
  }).catch(() => null);

  return result;
}

export async function submitDailyStudentAttendance(
  ctx: TenantContext,
  input: unknown
): Promise<SubmitDailyStudentAttendanceResult> {
  const data = submitStudentAttendanceSchema.parse(input);
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  const attendanceDate = normalizeDateOnly(data.attendanceDate);

  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (!branchId) throw validationError("ACTIVE_BRANCH_REQUIRED");
  if (!academicYearId) throw validationError("ACTIVE_ACADEMIC_YEAR_REQUIRED");
  if (data.sessionType !== "FULL_DAY") throw validationError("UNSUPPORTED_ATTENDANCE_SESSION_TYPE");

  try {
    const transactionResult = await db.$transaction(async (tx) => {
      const classSection = await tx.classSection.findFirst({
        where: {
          id: data.classSectionId,
          tenantId: ctx.tenantId,
          branchId,
          academicYearId,
          status: "ACTIVE"
        },
        select: { id: true, branchId: true, academicYearId: true, classTeacherUserId: true }
      });
      if (!classSection) throw notFound("CLASS_SECTION_NOT_FOUND");

      await requirePermission({
        ctx,
        permission: "academia.attendance.mark",
        branchId: classSection.branchId,
        academicYearId: classSection.academicYearId
      });

      if (classSection.classTeacherUserId !== ctx.userId) {
        await requirePermission({
          ctx,
          permission: "academia.attendance.update",
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId
        });
      }

      const holiday = await findApplicableCalendarEntry(tx, {
        tenantId: ctx.tenantId,
        branchId: classSection.branchId,
        academicYearId: classSection.academicYearId,
        attendanceDate,
        audience: "STUDENTS"
      });
      if (holiday) throw validationError("STUDENT_ATTENDANCE_HOLIDAY");

      const autoLockResult = await lockStudentAttendanceRecordsForScope(tx, ctx, {
        branchId: classSection.branchId,
        academicYearId: classSection.academicYearId,
        attendanceDate,
        classSectionId: classSection.id
      });
      if (autoLockResult.autoLockEnabled && autoLockResult.cutoffPassed) {
        return { kind: "cutoff-passed" as const };
      }

      const activeEnrollments = await tx.enrollment.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          status: "ACTIVE",
          enrolledOn: { lte: attendanceDate },
          OR: [{ leftOn: null }, { leftOn: { gte: attendanceDate } }],
          student: {
            tenantId: ctx.tenantId,
            branchId: classSection.branchId,
            status: "ACTIVE"
          }
        },
        select: { id: true, studentId: true }
      });
      if (activeEnrollments.length === 0) throw validationError("NO_ACTIVE_ENROLLMENTS");

      const enrollmentByStudentId = new Map(activeEnrollments.map((enrollment) => [enrollment.studentId, enrollment]));
      const submittedStudentIds = data.entries.map((entry) => entry.studentId);
      const unknownStudentIds = submittedStudentIds.filter((studentId) => !enrollmentByStudentId.has(studentId));
      if (unknownStudentIds.length > 0) {
        throw validationError("STUDENT_NOT_ACTIVE_ENROLLED");
      }

      const existingRecords = await tx.studentAttendanceRecord.findMany({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: classSection.academicYearId,
          attendanceDate,
          sessionType: "FULL_DAY",
          studentId: { in: submittedStudentIds }
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          academicYearId: true,
          classSectionId: true,
          enrollmentId: true,
          studentId: true,
          attendanceDate: true,
          sessionType: true,
          status: true,
          remarks: true,
          correctionReason: true,
          markedById: true,
          correctedById: true,
          markedAt: true,
          correctedAt: true,
          lockedAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      const existingRecordByStudentId = new Map(existingRecords.map((record) => [record.studentId, record]));
      if (existingRecords.some((record) => record.lockedAt)) {
        throw conflict("STUDENT_ATTENDANCE_LOCKED");
      }
      if (existingRecords.some((record) => record.branchId !== branchId || record.classSectionId !== classSection.id)) {
        throw conflict("STUDENT_ATTENDANCE_ALREADY_MARKED_FOR_DIFFERENT_SCOPE");
      }

      const result: SubmitDailyStudentAttendanceResult = {
        classSectionId: classSection.id,
        attendanceDate: toDateOnlyString(attendanceDate),
        sessionType: "FULL_DAY",
        totalActiveStudents: activeEnrollments.length,
        submittedCount: data.entries.length,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        halfDayCount: 0,
        onLeaveCount: 0,
        excusedCount: 0,
        updatedCount: 0,
        createdCount: 0,
        attendanceRecordIds: []
      };

      const markedAt = new Date();

      for (const entry of data.entries) {
        const enrollment = enrollmentByStudentId.get(entry.studentId);
        if (!enrollment) throw validationError("STUDENT_NOT_ACTIVE_ENROLLED");

        incrementStatusCount(result, entry.status);

        const attendanceData = {
          tenantId: ctx.tenantId,
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          enrollmentId: enrollment.id,
          studentId: entry.studentId,
          attendanceDate,
          sessionType: "FULL_DAY" as const,
          status: entry.status,
          remarks: entry.remarks,
          markedById: ctx.userId,
          markedAt
        };

        const existingRecord = existingRecordByStudentId.get(entry.studentId);
        if (existingRecord) {
          const after = await tx.studentAttendanceRecord.update({
            where: { id: existingRecord.id },
            data: attendanceData
          });
          result.updatedCount += 1;
          await writeAuditLog({
            ctx,
            action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_UPDATED,
            entityType: "StudentAttendanceRecord",
            entityId: after.id,
            branchId: after.branchId,
            academicYearId: after.academicYearId,
            before: existingRecord,
            after,
            metadata: {
              classSectionId: after.classSectionId,
              studentId: after.studentId,
              attendanceDate: result.attendanceDate,
              sessionType: after.sessionType,
              oldStatus: existingRecord.status,
              newStatus: after.status,
              remarksChanged: existingRecord.remarks !== after.remarks
            }
          }, tx);
          result.attendanceRecordIds.push(after.id);
          continue;
        }

        const after = await tx.studentAttendanceRecord.create({ data: attendanceData });
        result.createdCount += 1;
        result.attendanceRecordIds.push(after.id);
        await writeAuditLog({
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_SUBMITTED,
          entityType: "StudentAttendanceRecord",
          entityId: after.id,
          branchId: after.branchId,
          academicYearId: after.academicYearId,
          after,
          metadata: {
            classSectionId: after.classSectionId,
            studentId: after.studentId,
            attendanceDate: result.attendanceDate,
            sessionType: after.sessionType,
            newStatus: after.status
          }
        }, tx);
      }

      return result;
    });

    if ("kind" in transactionResult) {
      throw conflict("STUDENT_ATTENDANCE_CUTOFF_PASSED");
    }

    await queueAndDispatchStudentAttendanceNotifications(ctx, {
      branchId,
      academicYearId,
      classSectionId: transactionResult.classSectionId,
      attendanceDate,
      attendanceRecordIds: transactionResult.attendanceRecordIds
    }).catch(() => null);

    return transactionResult;
  } catch (error) {
    mapPrismaUniqueConflict(error);
  }
}
