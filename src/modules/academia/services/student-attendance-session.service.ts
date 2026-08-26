import { Prisma, type PrismaClient, type StudentAttendanceResponsibilitySource } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  completeStudentAttendanceSessionSchema,
  correctStudentAttendanceSessionEntrySchema,
  markRemainingStudentsPresentSchema,
  mutateStudentAttendanceEntrySchema,
  prepareStudentAttendanceSessionSchema,
  undoStudentAttendanceBulkSchema
} from "@/modules/academia/schemas";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { conflict, validationError } from "./shared";
import {
  correctStudentAttendance,
  lockStudentAttendanceRecordsForScope,
  queueAndDispatchStudentAttendanceNotifications,
  type CorrectStudentAttendanceResult
} from "./student-attendance.service";
import { requireStudentAttendanceSessionSchema } from "./student-attendance-schema-readiness";
import {
  activateStudentAttendanceDutyForNewSession,
  applyStudentAttendanceResponsibilityTransfer,
  completeStudentAttendanceDutyForSession,
  requireStudentAttendanceSessionResponsibility,
  resolveStudentAttendanceResponsibility
} from "./student-attendance-responsibility.service";

type AttendanceSessionDb = PrismaClient | Prisma.TransactionClient;
type CaptureStatus = "PRESENT" | "ABSENT" | "LEAVE";
type LegacyStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "HALF_DAY"
  | "ON_LEAVE"
  | "EXCUSED"
  | "NOT_MARKED";
type SessionState = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "REOPENED" | "LOCKED";

type AuthorizedSessionScope = {
  id: string;
  branchId: string;
  academicYearId: string;
  classSectionId: string;
  classTeacherUserId: string | null;
  attendanceDate: Date;
  state: string;
  responsibleUserId: string;
  responsibilitySource: StudentAttendanceResponsibilitySource;
};

type PrepareTransactionResult =
  | { kind: "ready"; sessionId: string }
  | { kind: "cutoff" };

type EntryTransactionResult =
  | {
    kind: "saved";
    entryId: string;
    attendanceRecordId: string | null;
    idempotent: boolean;
  }
  | { kind: "locked" }
  | { kind: "completed" }
  | { kind: "version-conflict" };

type BulkTransactionResult =
  | {
    kind: "saved";
    attendanceRecordIds: string[];
    affectedCount: number;
    bulkMutationId: string | null;
    idempotent: boolean;
  }
  | { kind: "locked" }
  | { kind: "completed" }
  | { kind: "version-conflict" };

type UndoTransactionResult =
  | {
    kind: "saved";
    affectedCount: number;
    bulkMutationId: string;
    idempotent: boolean;
  }
  | { kind: "locked" }
  | { kind: "completed" }
  | { kind: "version-conflict" };

type CompleteTransactionResult =
  | { kind: "saved" | "completed" }
  | { kind: "locked" }
  | { kind: "version-conflict" }
  | { kind: "unmarked"; unmarkedCount: number };

export type StudentAttendanceSessionEntryView = {
  entryId: string;
  enrollmentId: string;
  studentId: string;
  scholarNumber: string;
  rollNumber: string | null;
  displayName: string;
  status: CaptureStatus | null;
  legacyStatus: LegacyStatus | null;
  recordVersion: number;
  markedAt: string | null;
};

export type StudentAttendanceSessionView = {
  sessionId: string;
  classSectionId: string;
  classSectionName: string;
  attendanceDate: string;
  sessionType: "FULL_DAY";
  state: SessionState;
  sessionVersion: number;
  totalCount: number;
  markedCount: number;
  unmarkedCount: number;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  isLocked: boolean;
  responsibleUserName: string;
  responsibilitySource: StudentAttendanceResponsibilitySource;
  delegationReason: string | null;
  isDelegated: boolean;
  entries: StudentAttendanceSessionEntryView[];
};

export type AttendanceEntryMutationResult = {
  session: StudentAttendanceSessionView;
  entry: StudentAttendanceSessionEntryView;
  idempotent: boolean;
};

export type AttendanceBulkMutationResult = {
  session: StudentAttendanceSessionView;
  affectedCount: number;
  bulkMutationId: string | null;
  idempotent: boolean;
};

export type StudentAttendanceSessionCorrectionResult = {
  correction: CorrectStudentAttendanceResult;
  session: StudentAttendanceSessionView;
};

export const STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 60_000
} as const;

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function studentDisplayName(student: {
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
}) {
  return student.displayName ?? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

function legacyToCapture(status: LegacyStatus): CaptureStatus | null {
  switch (status) {
    case "PRESENT":
    case "LATE":
    case "HALF_DAY":
      return "PRESENT";
    case "ABSENT":
      return "ABSENT";
    case "ON_LEAVE":
    case "EXCUSED":
      return "LEAVE";
    case "NOT_MARKED":
      return null;
  }
}

function captureToLegacy(status: CaptureStatus): LegacyStatus {
  return status === "LEAVE" ? "ON_LEAVE" : status;
}

function ensureActorAndContext(ctx: TenantContext) {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (!ctx.activeBranchId) throw validationError("ACTIVE_BRANCH_REQUIRED");
  if (!ctx.activeAcademicYearId) throw validationError("ACTIVE_ACADEMIC_YEAR_REQUIRED");
  return {
    userId: ctx.userId,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  };
}

async function requireAttendanceMarkingEntitlements(ctx: TenantContext, branchId: string) {
  await requireAttendanceEntitlements(
    ctx,
    [
      { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
      { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MARKING, operation: "WRITE" }
    ],
    { branchId }
  );
}

 async function loadAuthorizedSessionScope(
  ctx: TenantContext,
  sessionId: string
): Promise<AuthorizedSessionScope> {
  const { branchId, academicYearId } = ensureActorAndContext(ctx);
  await requireAttendanceMarkingEntitlements(ctx, branchId);
  await requireStudentAttendanceSessionSchema();

  const session = await db.studentAttendanceSession.findFirst({
    where: {
      id: sessionId,
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      sessionType: "FULL_DAY"
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      classSectionId: true,
      attendanceDate: true,
      state: true,
      responsibleUserId: true,
      responsibilitySource: true,
      classSection: { select: { classTeacherUserId: true } }
    }
  });
  if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");

  await requireStudentAttendanceSessionResponsibility(ctx, {
    id: session.id,
    branchId: session.branchId,
    academicYearId: session.academicYearId,
    classSectionId: session.classSectionId,
    attendanceDate: session.attendanceDate,
    state: session.state,
    responsibleUserId: session.responsibleUserId,
    responsibilitySource: session.responsibilitySource
  });

  return {
    id: session.id,
    branchId: session.branchId,
    academicYearId: session.academicYearId,
    classSectionId: session.classSectionId,
    classTeacherUserId: session.classSection.classTeacherUserId,
    attendanceDate: session.attendanceDate,
    state: session.state,
    responsibleUserId: session.responsibleUserId,
    responsibilitySource: session.responsibilitySource
  };
}

async function loadSessionView(
  client: AttendanceSessionDb,
  tenantId: string,
  sessionId: string
): Promise<StudentAttendanceSessionView> {
  const session = await client.studentAttendanceSession.findFirst({
    where: { id: sessionId, tenantId },
    select: {
      id: true,
      classSectionId: true,
      attendanceDate: true,
      sessionType: true,
      state: true,
      sessionVersion: true,
      responsibilitySource: true,
      delegationReason: true,
      responsibleUser: {
        select: { displayName: true, firstName: true, lastName: true, email: true }
      },
      classSection: { select: { displayName: true } },
      entries: {
        where: { roster: { rosterState: "INCLUDED" } },
        select: {
          id: true,
          enrollmentId: true,
          status: true,
          legacyStatus: true,
          recordVersion: true,
          markedAt: true,
          roster: {
            select: {
              position: true,
              studentId: true,
              scholarNumber: true,
              studentName: true,
              rollNumber: true
            }
          }
        }
      }
    }
  });
  if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");
  if (session.sessionType !== "FULL_DAY") throw validationError("UNSUPPORTED_ATTENDANCE_SESSION_TYPE");

  const entries = session.entries
    .sort((left, right) => left.roster.position - right.roster.position)
    .map((entry) => ({
      entryId: entry.id,
      enrollmentId: entry.enrollmentId,
      studentId: entry.roster.studentId,
      scholarNumber: entry.roster.scholarNumber,
      rollNumber: entry.roster.rollNumber,
      displayName: entry.roster.studentName,
      status: entry.status as CaptureStatus | null,
      legacyStatus: entry.legacyStatus as LegacyStatus | null,
      recordVersion: entry.recordVersion,
      markedAt: entry.markedAt?.toISOString() ?? null
    }));

  const presentCount = entries.filter((entry) => entry.status === "PRESENT").length;
  const absentCount = entries.filter((entry) => entry.status === "ABSENT").length;
  const leaveCount = entries.filter((entry) => entry.status === "LEAVE").length;
  const markedCount = presentCount + absentCount + leaveCount;

  return {
    sessionId: session.id,
    classSectionId: session.classSectionId,
    classSectionName: session.classSection.displayName,
    attendanceDate: toDateOnlyString(session.attendanceDate),
    sessionType: "FULL_DAY",
    state: session.state as SessionState,
    sessionVersion: session.sessionVersion,
    totalCount: entries.length,
    markedCount,
    unmarkedCount: entries.length - markedCount,
    presentCount,
    absentCount,
    leaveCount,
    isLocked: session.state === "LOCKED",
    responsibleUserName: session.responsibleUser.displayName ??
      ([session.responsibleUser.firstName, session.responsibleUser.lastName].filter(Boolean).join(" ") || session.responsibleUser.email),
    responsibilitySource: session.responsibilitySource,
    delegationReason: session.delegationReason,
    isDelegated: session.responsibilitySource !== "CLASS_TEACHER",
    entries
  };
}

async function requireWorkingDay(
  client: AttendanceSessionDb,
  ctx: TenantContext,
  input: { branchId: string; academicYearId: string; attendanceDate: Date }
) {
  const holiday = await findApplicableCalendarEntry(client, {
    tenantId: ctx.tenantId,
    branchId: input.branchId,
    academicYearId: input.academicYearId,
    attendanceDate: input.attendanceDate,
    audience: "STUDENTS"
  });
  if (holiday) throw validationError("STUDENT_ATTENDANCE_HOLIDAY");
}

function isPrismaConcurrencyConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

async function markSessionLocked(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  scope: AuthorizedSessionScope,
  attendanceDate: Date
) {
  const lock = await lockStudentAttendanceRecordsForScope(tx, ctx, {
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    classSectionId: scope.classSectionId,
    attendanceDate
  });

  if (lock.autoLockEnabled && lock.cutoffPassed) {
    await tx.studentAttendanceSession.updateMany({
      where: {
        id: scope.id,
        tenantId: ctx.tenantId,
        state: { in: ["DRAFT", "IN_PROGRESS", "REOPENED"] }
      },
      data: { state: "LOCKED", lockedAt: new Date(), sessionVersion: { increment: 1 } }
    });
    return true;
  }
  return false;
}

export async function prepareStudentAttendanceSession(
  ctx: TenantContext,
  input: unknown
): Promise<StudentAttendanceSessionView> {
  const data = prepareStudentAttendanceSessionSchema.parse(input);
  const { userId, branchId, academicYearId } = ensureActorAndContext(ctx);
  const attendanceDate = normalizeDateOnly(data.attendanceDate);
  await requireAttendanceMarkingEntitlements(ctx, branchId);

  const classSection = await db.classSection.findFirst({
    where: {
      id: data.classSectionId,
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      status: "ACTIVE"
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      classTeacherUserId: true,
      branch: { select: { institutionId: true } }
    }
  });
  if (!classSection) throw notFound("CLASS_SECTION_NOT_FOUND");
  await requireStudentAttendanceSessionSchema();
  const responsibility = await resolveStudentAttendanceResponsibility(ctx, {
    branchId: classSection.branchId,
    academicYearId: classSection.academicYearId,
    classSectionId: classSection.id,
    classTeacherUserId: classSection.classTeacherUserId,
    attendanceDate,
    delegationReason: data.delegationReason
  });

  const scope: AuthorizedSessionScope = {
    id: "",
    branchId: classSection.branchId,
    academicYearId: classSection.academicYearId,
    classSectionId: classSection.id,
    classTeacherUserId: classSection.classTeacherUserId,
    attendanceDate,
    state: "DRAFT",
    responsibleUserId: responsibility.responsibleUserId,
    responsibilitySource: responsibility.responsibilitySource
  };

  try {
    const result = await db.$transaction<PrepareTransactionResult>(async (tx) => {
      await requireWorkingDay(tx, ctx, {
        branchId: classSection.branchId,
        academicYearId: classSection.academicYearId,
        attendanceDate
      });

      const existing = await tx.studentAttendanceSession.findFirst({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: "FULL_DAY"
        },
        select: {
          id: true,
          state: true,
          attendanceDate: true,
          responsibleUserId: true,
          responsibilitySource: true
        }
      });
      if (existing) {
        scope.id = existing.id;
        scope.state = existing.state;
        scope.responsibleUserId = existing.responsibleUserId;
        scope.responsibilitySource = existing.responsibilitySource;
        await applyStudentAttendanceResponsibilityTransfer(tx, ctx, {
          ...scope,
          attendanceDate: existing.attendanceDate
        }, responsibility);
        scope.responsibleUserId = responsibility.responsibleUserId;
        scope.responsibilitySource = responsibility.responsibilitySource;
        if (existing.state !== "COMPLETED" && existing.state !== "LOCKED") {
          await markSessionLocked(tx, ctx, scope, attendanceDate);
        }
        return { kind: "ready", sessionId: existing.id };
      }

      const lock = await lockStudentAttendanceRecordsForScope(tx, ctx, {
        branchId: classSection.branchId,
        academicYearId: classSection.academicYearId,
        classSectionId: classSection.id,
        attendanceDate
      });
      if (lock.autoLockEnabled && lock.cutoffPassed) return { kind: "cutoff" };

      const enrollments = await tx.enrollment.findMany({
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
        select: {
          id: true,
          studentId: true,
          rollNumber: true,
          student: {
            select: {
              admissionNumber: true,
              displayName: true,
              firstName: true,
              middleName: true,
              lastName: true
            }
          }
        },
        orderBy: [
          { rollNumber: "asc" },
          { student: { displayName: "asc" } },
          { student: { firstName: "asc" } },
          { student: { admissionNumber: "asc" } }
        ]
      });
      if (enrollments.length === 0) throw validationError("NO_ACTIVE_ENROLLMENTS");

      const existingRecords = await tx.studentAttendanceRecord.findMany({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: "FULL_DAY",
          studentId: { in: enrollments.map((enrollment) => enrollment.studentId) }
        },
        select: { studentId: true, status: true, lockedAt: true }
      });
      if (existingRecords.some((record) => record.lockedAt)) {
        throw conflict("STUDENT_ATTENDANCE_LOCKED");
      }

      const recordByStudentId = new Map(existingRecords.map((record) => [record.studentId, record]));
      const sessionId = crypto.randomUUID();
      const snapshots = enrollments.map((enrollment, position) => {
        const record = recordByStudentId.get(enrollment.studentId);
        const rosterId = crypto.randomUUID();
        return {
          roster: {
            id: rosterId,
            tenantId: ctx.tenantId,
            sessionId,
            enrollmentId: enrollment.id,
            studentId: enrollment.studentId,
            rosterState: "INCLUDED" as const,
            position,
            scholarNumber: enrollment.student.admissionNumber,
            studentName: studentDisplayName(enrollment.student),
            rollNumber: enrollment.rollNumber
          },
          entry: {
            id: crypto.randomUUID(),
            tenantId: ctx.tenantId,
            sessionId,
            rosterId,
            enrollmentId: enrollment.id,
            status: record ? legacyToCapture(record.status as LegacyStatus) : null,
            legacyStatus: (record?.status as LegacyStatus | undefined) ?? null,
            recordVersion: record ? 1 : 0,
            updatedById: record ? userId : null,
            markedAt: record ? new Date() : null
          }
        };
      });
      const hasExistingMarks = snapshots.some((snapshot) => snapshot.entry.status !== null);

      await tx.studentAttendanceSession.create({
        data: {
          id: sessionId,
          tenantId: ctx.tenantId,
          institutionId: classSection.branch.institutionId,
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: "FULL_DAY",
          state: hasExistingMarks ? "IN_PROGRESS" : "DRAFT",
          sessionVersion: 0,
          rosterVersion: 1,
          startedById: userId,
          responsibleUserId: responsibility.responsibleUserId,
          responsibilitySource: responsibility.responsibilitySource,
          originalClassTeacherUserId: responsibility.originalClassTeacherUserId,
          delegatedByUserId: responsibility.delegatedByUserId,
          delegationReason: responsibility.delegationReason,
          responsibilityTransferredAt: responsibility.responsibilitySource === "CLASS_TEACHER" ? null : new Date()
        }
      });
      await activateStudentAttendanceDutyForNewSession(tx, ctx, {
        sessionId,
        responsibility
      });
      await tx.studentAttendanceSessionRoster.createMany({
        data: snapshots.map((snapshot) => snapshot.roster)
      });
      await tx.studentAttendanceSessionEntry.createMany({
        data: snapshots.map((snapshot) => snapshot.entry)
      });

      await writeAuditLog(
        {
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_SESSION_OPENED,
          entityType: "StudentAttendanceSession",
          entityId: sessionId,
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId,
          after: {
            state: hasExistingMarks ? "IN_PROGRESS" : "DRAFT",
            rosterCount: snapshots.length,
            rosterVersion: 1,
            responsibleUserId: responsibility.responsibleUserId,
            responsibilitySource: responsibility.responsibilitySource
          },
          metadata: {
            classSectionId: classSection.id,
            attendanceDate: toDateOnlyString(attendanceDate),
            sessionType: "FULL_DAY",
            dutyAssignmentId: responsibility.assignmentId
          }
        },
        tx
      );

      return { kind: "ready", sessionId };
    }, STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS);

    if (result.kind === "cutoff") throw conflict("STUDENT_ATTENDANCE_CUTOFF_PASSED");
    return loadSessionView(db, ctx.tenantId, result.sessionId);
  } catch (error) {
    if (isPrismaConcurrencyConflict(error)) {
      const existing = await db.studentAttendanceSession.findFirst({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: "FULL_DAY"
        },
        select: { id: true }
      });
      if (existing) {
        await loadAuthorizedSessionScope(ctx, existing.id);
        return loadSessionView(db, ctx.tenantId, existing.id);
      }
      throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    }
    throw error;
  }
}

export async function mutateStudentAttendanceEntry(
  ctx: TenantContext,
  input: unknown
): Promise<AttendanceEntryMutationResult> {
  const data = mutateStudentAttendanceEntrySchema.parse(input);
  const scope = await loadAuthorizedSessionScope(ctx, data.sessionId);
  const capturedAtClient = data.capturedAtClient ? new Date(data.capturedAtClient) : null;

  try {
    const result = await db.$transaction<EntryTransactionResult>(async (tx) => {
      const session = await tx.studentAttendanceSession.findFirst({
        where: {
          id: scope.id,
          tenantId: ctx.tenantId,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId
        },
        select: { state: true, attendanceDate: true }
      });
      if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");

      const previousMutation = await tx.studentAttendanceMutation.findFirst({
        where: { tenantId: ctx.tenantId, clientMutationId: data.clientMutationId },
        select: {
          sessionId: true,
          entryId: true,
          newStatus: true,
          baseRecordVersion: true
        }
      });
      if (previousMutation) {
        if (
          previousMutation.sessionId !== scope.id ||
          previousMutation.entryId !== data.entryId ||
          previousMutation.newStatus !== data.status ||
          previousMutation.baseRecordVersion !== data.baseRecordVersion
        ) {
          throw conflict("STUDENT_ATTENDANCE_MUTATION_ID_REUSED");
        }
        return {
          kind: "saved",
          entryId: data.entryId,
          attendanceRecordId: null,
          idempotent: true
        };
      }

      await requireWorkingDay(tx, ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate: session.attendanceDate
      });
      if (await markSessionLocked(tx, ctx, scope, session.attendanceDate)) return { kind: "locked" };
      if (session.state === "COMPLETED") return { kind: "completed" };
      if (session.state === "LOCKED") return { kind: "locked" };

      const entry = await tx.studentAttendanceSessionEntry.findFirst({
        where: { id: data.entryId, tenantId: ctx.tenantId, sessionId: scope.id },
        select: {
          id: true,
          enrollmentId: true,
          status: true,
          recordVersion: true,
          roster: { select: { studentId: true } }
        }
      });
      if (!entry) throw notFound("STUDENT_ATTENDANCE_ENTRY_NOT_FOUND");
      if (entry.recordVersion !== data.baseRecordVersion) {
        if (entry.status === data.status) {
          return {
            kind: "saved",
            entryId: entry.id,
            attendanceRecordId: null,
            idempotent: true
          };
        }
        return { kind: "version-conflict" };
      }

      const existingRecord = await tx.studentAttendanceRecord.findFirst({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: scope.academicYearId,
          studentId: entry.roster.studentId,
          attendanceDate: session.attendanceDate,
          sessionType: "FULL_DAY"
        }
      });
      if (existingRecord?.lockedAt) return { kind: "locked" };
      if (
        existingRecord &&
        (existingRecord.branchId !== scope.branchId ||
          existingRecord.classSectionId !== scope.classSectionId ||
          existingRecord.enrollmentId !== entry.enrollmentId)
      ) {
        throw conflict("STUDENT_ATTENDANCE_ALREADY_MARKED_FOR_DIFFERENT_SCOPE");
      }

      const markedAt = new Date();
      const legacyStatus = captureToLegacy(data.status);
      const attendanceRecord = existingRecord
        ? await tx.studentAttendanceRecord.update({
          where: { id: existingRecord.id },
          data: { status: legacyStatus, markedById: ctx.userId, markedAt }
        })
        : await tx.studentAttendanceRecord.create({
          data: {
            tenantId: ctx.tenantId,
            branchId: scope.branchId,
            academicYearId: scope.academicYearId,
            classSectionId: scope.classSectionId,
            enrollmentId: entry.enrollmentId,
            studentId: entry.roster.studentId,
            attendanceDate: session.attendanceDate,
            sessionType: "FULL_DAY",
            status: legacyStatus,
            markedById: ctx.userId,
            markedAt
          }
        });

      const entryUpdate = await tx.studentAttendanceSessionEntry.updateMany({
        where: {
          id: entry.id,
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          recordVersion: data.baseRecordVersion
        },
        data: {
          status: data.status,
          legacyStatus,
          recordVersion: { increment: 1 },
          updatedById: ctx.userId,
          markedAt
        }
      });
      if (entryUpdate.count !== 1) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");

      await tx.studentAttendanceMutation.create({
        data: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          entryId: entry.id,
          actorUserId: ctx.userId,
          clientMutationId: data.clientMutationId,
          source: "ONLINE",
          previousStatus: entry.status,
          newStatus: data.status,
          baseRecordVersion: entry.recordVersion,
          resultingRecordVersion: entry.recordVersion + 1,
          capturedAtClient,
          metadataJson: { attendanceRecordId: attendanceRecord.id }
        }
      });
      await tx.studentAttendanceSession.update({
        where: { id: scope.id },
        data: { state: "IN_PROGRESS", sessionVersion: { increment: 1 }, lastMutationAt: markedAt }
      });

      await writeAuditLog(
        {
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_ENTRY_SAVED,
          entityType: "StudentAttendanceSessionEntry",
          entityId: entry.id,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          before: { status: entry.status, recordVersion: entry.recordVersion },
          after: { status: data.status, recordVersion: entry.recordVersion + 1 },
          metadata: {
            sessionId: scope.id,
            classSectionId: scope.classSectionId,
            attendanceDate: toDateOnlyString(session.attendanceDate),
            attendanceRecordId: attendanceRecord.id
          }
        },
        tx
      );

      return {
        kind: "saved",
        entryId: entry.id,
        attendanceRecordId: attendanceRecord.id,
        idempotent: false
      };
    }, STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS);

    if (result.kind === "locked") throw conflict("STUDENT_ATTENDANCE_LOCKED");
    if (result.kind === "completed") throw conflict("STUDENT_ATTENDANCE_SESSION_COMPLETED");
    if (result.kind === "version-conflict") throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");

    const sessionView = await loadSessionView(db, ctx.tenantId, scope.id);
    if (result.attendanceRecordId) {
      await queueAndDispatchStudentAttendanceNotifications(ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        classSectionId: scope.classSectionId,
        attendanceDate: new Date(`${sessionView.attendanceDate}T00:00:00.000Z`),
        attendanceRecordIds: [result.attendanceRecordId]
      }).catch(() => null);
    }

    const entryView = sessionView.entries.find((entry) => entry.entryId === result.entryId);
    if (!entryView) throw notFound("STUDENT_ATTENDANCE_ENTRY_NOT_FOUND");
    return { session: sessionView, entry: entryView, idempotent: result.idempotent };
  } catch (error) {
    if (isPrismaConcurrencyConflict(error)) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    throw error;
  }
}

export async function markRemainingStudentsPresent(
  ctx: TenantContext,
  input: unknown
): Promise<AttendanceBulkMutationResult> {
  const data = markRemainingStudentsPresentSchema.parse(input);
  const scope = await loadAuthorizedSessionScope(ctx, data.sessionId);

  try {
    const result = await db.$transaction<BulkTransactionResult>(async (tx) => {
      const session = await tx.studentAttendanceSession.findFirst({
        where: { id: scope.id, tenantId: ctx.tenantId },
        select: { state: true, sessionVersion: true, attendanceDate: true }
      });
      if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");

      const previousBulkCount = await tx.studentAttendanceMutation.count({
        where: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          bulkMutationId: data.clientMutationId,
          source: "BULK_PRESENT"
        }
      });
      if (previousBulkCount > 0) {
        return {
          kind: "saved",
          attendanceRecordIds: [],
          affectedCount: previousBulkCount,
          bulkMutationId: data.clientMutationId,
          idempotent: true
        };
      }

      await requireWorkingDay(tx, ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate: session.attendanceDate
      });
      if (await markSessionLocked(tx, ctx, scope, session.attendanceDate)) return { kind: "locked" };
      if (session.state === "COMPLETED") return { kind: "completed" };
      if (session.state === "LOCKED") return { kind: "locked" };
      if (session.sessionVersion !== data.baseSessionVersion) return { kind: "version-conflict" };

      const remaining = await tx.studentAttendanceSessionEntry.findMany({
        where: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          status: null,
          roster: { rosterState: "INCLUDED" }
        },
        select: {
          id: true,
          enrollmentId: true,
          recordVersion: true,
          roster: { select: { studentId: true } }
        }
      });
      if (remaining.length === 0) {
        return {
          kind: "saved",
          attendanceRecordIds: [],
          affectedCount: 0,
          bulkMutationId: null,
          idempotent: false
        };
      }

      const existingRecords = await tx.studentAttendanceRecord.findMany({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: scope.academicYearId,
          attendanceDate: session.attendanceDate,
          sessionType: "FULL_DAY",
          studentId: { in: remaining.map((entry) => entry.roster.studentId) }
        }
      });
      if (existingRecords.some((record) => record.lockedAt)) return { kind: "locked" };
      const recordByStudentId = new Map(existingRecords.map((record) => [record.studentId, record]));
      for (const entry of remaining) {
        const existingRecord = recordByStudentId.get(entry.roster.studentId);
        if (
          existingRecord &&
          (existingRecord.branchId !== scope.branchId ||
            existingRecord.classSectionId !== scope.classSectionId ||
            existingRecord.enrollmentId !== entry.enrollmentId)
        ) {
          throw conflict("STUDENT_ATTENDANCE_ALREADY_MARKED_FOR_DIFFERENT_SCOPE");
        }
      }

      const reserved = await tx.studentAttendanceSession.updateMany({
        where: {
          id: scope.id,
          tenantId: ctx.tenantId,
          sessionVersion: data.baseSessionVersion,
          state: { in: ["DRAFT", "IN_PROGRESS", "REOPENED"] }
        },
        data: { state: "IN_PROGRESS", sessionVersion: { increment: 1 }, lastMutationAt: new Date() }
      });
      if (reserved.count !== 1) return { kind: "version-conflict" };

      const attendanceRecordIds: string[] = [];
      const mutations: Prisma.StudentAttendanceMutationCreateManyInput[] = [];
      const markedAt = new Date();
      for (const entry of remaining) {
        const existingRecord = recordByStudentId.get(entry.roster.studentId);
        const attendanceRecord = existingRecord
          ? await tx.studentAttendanceRecord.update({
            where: { id: existingRecord.id },
            data: { status: "PRESENT", markedById: ctx.userId, markedAt }
          })
          : await tx.studentAttendanceRecord.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: scope.branchId,
              academicYearId: scope.academicYearId,
              classSectionId: scope.classSectionId,
              enrollmentId: entry.enrollmentId,
              studentId: entry.roster.studentId,
              attendanceDate: session.attendanceDate,
              sessionType: "FULL_DAY",
              status: "PRESENT",
              markedById: ctx.userId,
              markedAt
            }
          });
        attendanceRecordIds.push(attendanceRecord.id);

        const updated = await tx.studentAttendanceSessionEntry.updateMany({
          where: {
            id: entry.id,
            tenantId: ctx.tenantId,
            sessionId: scope.id,
            recordVersion: entry.recordVersion,
            status: null
          },
          data: {
            status: "PRESENT",
            legacyStatus: "PRESENT",
            recordVersion: { increment: 1 },
            updatedById: ctx.userId,
            markedAt
          }
        });
        if (updated.count !== 1) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
        mutations.push({
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          entryId: entry.id,
          actorUserId: ctx.userId,
          clientMutationId: crypto.randomUUID(),
          bulkMutationId: data.clientMutationId,
          source: "BULK_PRESENT",
          previousStatus: null,
          newStatus: "PRESENT",
          baseRecordVersion: entry.recordVersion,
          resultingRecordVersion: entry.recordVersion + 1,
          metadataJson: { attendanceRecordId: attendanceRecord.id }
        });
      }
      await tx.studentAttendanceMutation.createMany({ data: mutations });

      await writeAuditLog(
        {
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_REMAINING_MARKED_PRESENT,
          entityType: "StudentAttendanceSession",
          entityId: scope.id,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          before: { unmarkedCount: remaining.length },
          after: { unmarkedCount: 0, markedPresentCount: remaining.length },
          metadata: {
            classSectionId: scope.classSectionId,
            attendanceDate: toDateOnlyString(session.attendanceDate),
            bulkMutationId: data.clientMutationId
          }
        },
        tx
      );

      return {
        kind: "saved",
        attendanceRecordIds,
        affectedCount: remaining.length,
        bulkMutationId: data.clientMutationId,
        idempotent: false
      };
    }, STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS);

    if (result.kind === "locked") throw conflict("STUDENT_ATTENDANCE_LOCKED");
    if (result.kind === "completed") throw conflict("STUDENT_ATTENDANCE_SESSION_COMPLETED");
    if (result.kind === "version-conflict") throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");

    const sessionView = await loadSessionView(db, ctx.tenantId, scope.id);
    if (result.attendanceRecordIds.length > 0) {
      await queueAndDispatchStudentAttendanceNotifications(ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        classSectionId: scope.classSectionId,
        attendanceDate: new Date(`${sessionView.attendanceDate}T00:00:00.000Z`),
        attendanceRecordIds: result.attendanceRecordIds
      }).catch(() => null);
    }
    return {
      session: sessionView,
      affectedCount: result.affectedCount,
      bulkMutationId: result.bulkMutationId,
      idempotent: result.idempotent
    };
  } catch (error) {
    if (isPrismaConcurrencyConflict(error)) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    throw error;
  }
}

export async function undoStudentAttendanceBulk(
  ctx: TenantContext,
  input: unknown
): Promise<AttendanceBulkMutationResult> {
  const data = undoStudentAttendanceBulkSchema.parse(input);
  const scope = await loadAuthorizedSessionScope(ctx, data.sessionId);

  try {
    const result = await db.$transaction<UndoTransactionResult>(async (tx) => {
      const session = await tx.studentAttendanceSession.findFirst({
        where: { id: scope.id, tenantId: ctx.tenantId },
        select: { state: true, sessionVersion: true, attendanceDate: true }
      });
      if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");

      const previousUndoCount = await tx.studentAttendanceMutation.count({
        where: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          bulkMutationId: data.clientMutationId,
          source: "BULK_UNDO"
        }
      });
      if (previousUndoCount > 0) {
        return {
          kind: "saved",
          affectedCount: previousUndoCount,
          bulkMutationId: data.clientMutationId,
          idempotent: true
        };
      }

      await requireWorkingDay(tx, ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate: session.attendanceDate
      });
      if (await markSessionLocked(tx, ctx, scope, session.attendanceDate)) return { kind: "locked" };
      if (session.state === "COMPLETED") return { kind: "completed" };
      if (session.state === "LOCKED") return { kind: "locked" };
      if (session.sessionVersion !== data.baseSessionVersion) return { kind: "version-conflict" };

      const targetMutations = await tx.studentAttendanceMutation.findMany({
        where: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          bulkMutationId: data.targetBulkMutationId,
          source: "BULK_PRESENT"
        },
        select: {
          previousStatus: true,
          resultingRecordVersion: true,
          entry: {
            select: {
              id: true,
              status: true,
              recordVersion: true,
              roster: { select: { studentId: true } }
            }
          }
        }
      });
      if (targetMutations.length === 0) throw notFound("STUDENT_ATTENDANCE_BULK_NOT_FOUND");
      if (
        targetMutations.some(
          (mutation) =>
            mutation.entry.recordVersion !== mutation.resultingRecordVersion ||
            mutation.entry.status !== "PRESENT"
        )
      ) {
        throw conflict("STUDENT_ATTENDANCE_BULK_UNDO_UNAVAILABLE");
      }

      const reserved = await tx.studentAttendanceSession.updateMany({
        where: {
          id: scope.id,
          tenantId: ctx.tenantId,
          sessionVersion: data.baseSessionVersion,
          state: { in: ["DRAFT", "IN_PROGRESS", "REOPENED"] }
        },
        data: { sessionVersion: { increment: 1 }, lastMutationAt: new Date() }
      });
      if (reserved.count !== 1) return { kind: "version-conflict" };

      const undoMutations: Prisma.StudentAttendanceMutationCreateManyInput[] = [];
      const changedAt = new Date();
      for (const mutation of targetMutations) {
        const restoredStatus = mutation.previousStatus as CaptureStatus | null;
        const restoredLegacyStatus = restoredStatus ? captureToLegacy(restoredStatus) : "NOT_MARKED";
        const updated = await tx.studentAttendanceSessionEntry.updateMany({
          where: {
            id: mutation.entry.id,
            tenantId: ctx.tenantId,
            sessionId: scope.id,
            recordVersion: mutation.resultingRecordVersion,
            status: "PRESENT"
          },
          data: {
            status: restoredStatus,
            legacyStatus: restoredLegacyStatus,
            recordVersion: { increment: 1 },
            updatedById: ctx.userId,
            markedAt: restoredStatus ? changedAt : null
          }
        });
        if (updated.count !== 1) throw conflict("STUDENT_ATTENDANCE_BULK_UNDO_UNAVAILABLE");

        const projectionUpdated = await tx.studentAttendanceRecord.updateMany({
          where: {
            tenantId: ctx.tenantId,
            academicYearId: scope.academicYearId,
            classSectionId: scope.classSectionId,
            studentId: mutation.entry.roster.studentId,
            attendanceDate: session.attendanceDate,
            sessionType: "FULL_DAY",
            lockedAt: null
          },
          data: {
            status: restoredLegacyStatus,
            markedById: restoredStatus ? ctx.userId : null,
            markedAt: restoredStatus ? changedAt : null
          }
        });
        if (projectionUpdated.count !== 1) {
          throw conflict("STUDENT_ATTENDANCE_BULK_UNDO_UNAVAILABLE");
        }

        undoMutations.push({
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          entryId: mutation.entry.id,
          actorUserId: ctx.userId,
          clientMutationId: crypto.randomUUID(),
          bulkMutationId: data.clientMutationId,
          source: "BULK_UNDO",
          previousStatus: "PRESENT",
          newStatus: restoredStatus,
          baseRecordVersion: mutation.entry.recordVersion,
          resultingRecordVersion: mutation.entry.recordVersion + 1,
          metadataJson: { targetBulkMutationId: data.targetBulkMutationId }
        });
      }
      await tx.studentAttendanceMutation.createMany({ data: undoMutations });

      await writeAuditLog(
        {
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_BULK_UNDONE,
          entityType: "StudentAttendanceSession",
          entityId: scope.id,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          before: { bulkMutationId: data.targetBulkMutationId, affectedCount: targetMutations.length },
          after: { undoBulkMutationId: data.clientMutationId, affectedCount: targetMutations.length },
          metadata: {
            classSectionId: scope.classSectionId,
            attendanceDate: toDateOnlyString(session.attendanceDate)
          }
        },
        tx
      );

      return {
        kind: "saved",
        affectedCount: targetMutations.length,
        bulkMutationId: data.clientMutationId,
        idempotent: false
      };
    }, STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS);

    if (result.kind === "locked") throw conflict("STUDENT_ATTENDANCE_LOCKED");
    if (result.kind === "completed") throw conflict("STUDENT_ATTENDANCE_SESSION_COMPLETED");
    if (result.kind === "version-conflict") throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");

    return {
      session: await loadSessionView(db, ctx.tenantId, scope.id),
      affectedCount: result.affectedCount,
      bulkMutationId: result.bulkMutationId,
      idempotent: result.idempotent
    };
  } catch (error) {
    if (isPrismaConcurrencyConflict(error)) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    throw error;
  }
}

export async function completeStudentAttendanceSession(
  ctx: TenantContext,
  input: unknown
): Promise<StudentAttendanceSessionView> {
  const data = completeStudentAttendanceSessionSchema.parse(input);
  const scope = await loadAuthorizedSessionScope(ctx, data.sessionId);

  try {
    const result = await db.$transaction<CompleteTransactionResult>(async (tx) => {
      const session = await tx.studentAttendanceSession.findFirst({
        where: { id: scope.id, tenantId: ctx.tenantId },
        select: { state: true, sessionVersion: true, attendanceDate: true }
      });
      if (!session) throw notFound("STUDENT_ATTENDANCE_SESSION_NOT_FOUND");
      if (session.state === "COMPLETED") return { kind: "completed" };

      await requireWorkingDay(tx, ctx, {
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate: session.attendanceDate
      });
      if (await markSessionLocked(tx, ctx, scope, session.attendanceDate)) return { kind: "locked" };
      if (session.state === "LOCKED") return { kind: "locked" };
      if (session.sessionVersion !== data.expectedSessionVersion) return { kind: "version-conflict" };

      const unmarkedCount = await tx.studentAttendanceSessionEntry.count({
        where: {
          tenantId: ctx.tenantId,
          sessionId: scope.id,
          status: null,
          roster: { rosterState: "INCLUDED" }
        }
      });
      if (unmarkedCount > 0) return { kind: "unmarked", unmarkedCount };

      const completedAt = new Date();
      const updated = await tx.studentAttendanceSession.updateMany({
        where: {
          id: scope.id,
          tenantId: ctx.tenantId,
          sessionVersion: data.expectedSessionVersion,
          state: { in: ["DRAFT", "IN_PROGRESS", "REOPENED"] }
        },
        data: {
          state: "COMPLETED",
          completedById: ctx.userId,
          completedAt,
          sessionVersion: { increment: 1 }
        }
      });
      if (updated.count !== 1) return { kind: "version-conflict" };

      await completeStudentAttendanceDutyForSession(tx, ctx, {
        ...scope,
        attendanceDate: session.attendanceDate,
        state: "COMPLETED"
      });

      const counts = await tx.studentAttendanceSessionEntry.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId, sessionId: scope.id },
        _count: { _all: true }
      });
      await writeAuditLog(
        {
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_SESSION_COMPLETED,
          entityType: "StudentAttendanceSession",
          entityId: scope.id,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          before: { state: session.state, sessionVersion: session.sessionVersion },
          after: { state: "COMPLETED", sessionVersion: session.sessionVersion + 1, completedAt },
          metadata: {
            classSectionId: scope.classSectionId,
            attendanceDate: toDateOnlyString(session.attendanceDate),
            responsibilitySource: scope.responsibilitySource,
            statusCounts: counts
          }
        },
        tx
      );

      return { kind: "saved" };
    }, STUDENT_ATTENDANCE_SESSION_TRANSACTION_OPTIONS);

    if (result.kind === "locked") throw conflict("STUDENT_ATTENDANCE_LOCKED");
    if (result.kind === "version-conflict") throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    if (result.kind === "unmarked") throw validationError("STUDENT_ATTENDANCE_UNMARKED_REMAIN");
    return loadSessionView(db, ctx.tenantId, scope.id);
  } catch (error) {
    if (isPrismaConcurrencyConflict(error)) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");
    throw error;
  }
}

export async function correctStudentAttendanceSessionEntry(
  ctx: TenantContext,
  input: unknown
): Promise<StudentAttendanceSessionCorrectionResult> {
  const data = correctStudentAttendanceSessionEntrySchema.parse(input);
  const { branchId, academicYearId } = ensureActorAndContext(ctx);
  await requireStudentAttendanceSessionSchema();
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.CORRECTION, operation: "WRITE" }
  ], { branchId });
  await requirePermission({
    ctx,
    permission: "academia.attendance.correct",
    branchId,
    academicYearId
  });

  const entry = await db.studentAttendanceSessionEntry.findFirst({
    where: {
      id: data.entryId,
      tenantId: ctx.tenantId,
      sessionId: data.sessionId,
      session: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        sessionType: "FULL_DAY",
        state: { in: ["COMPLETED", "LOCKED"] }
      }
    },
    select: {
      enrollmentId: true,
      roster: { select: { studentId: true } },
      session: {
        select: {
          id: true,
          classSectionId: true,
          attendanceDate: true
        }
      }
    }
  });
  if (!entry) throw notFound("STUDENT_ATTENDANCE_ENTRY_NOT_FOUND");

  const attendanceRecord = await db.studentAttendanceRecord.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      classSectionId: entry.session.classSectionId,
      enrollmentId: entry.enrollmentId,
      studentId: entry.roster.studentId,
      attendanceDate: entry.session.attendanceDate,
      sessionType: "FULL_DAY"
    },
    select: { id: true }
  });
  if (!attendanceRecord) throw notFound("STUDENT_ATTENDANCE_RECORD_NOT_FOUND");

  const correction = await correctStudentAttendance(ctx, {
    attendanceRecordId: attendanceRecord.id,
    status: data.status,
    correctionReason: data.correctionReason,
    remarks: data.remarks
  });

  return {
    correction,
    session: await loadSessionView(db, ctx.tenantId, entry.session.id)
  };
}
