import {
  Prisma,
  type StudentAttendanceDutyAssignmentType,
  type StudentAttendanceResponsibilitySource
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import {
  LIVE_DUTY_STATUSES,
  USABLE_DUTY_STATUSES,
  attendanceDateString,
  ensureAttendanceContext,
  normalizeAttendanceDate
} from "./student-attendance-duty.shared";
import { conflict, validationError } from "./shared";

export type StudentAttendanceResponsibility = {
  responsibleUserId: string;
  responsibilitySource: StudentAttendanceResponsibilitySource;
  originalClassTeacherUserId: string | null;
  delegatedByUserId: string | null;
  delegationReason: string | null;
  assignmentId: string | null;
  assignmentType: StudentAttendanceDutyAssignmentType | null;
};

export type AttendanceResponsibilitySessionScope = {
  id: string;
  branchId: string;
  academicYearId: string;
  classSectionId: string;
  attendanceDate: Date;
  state: string;
  responsibleUserId: string;
  responsibilitySource: StudentAttendanceResponsibilitySource;
};

function assignmentResponsibilitySource(type: StudentAttendanceDutyAssignmentType) {
  return type === "ATTENDANCE_OPERATOR" ? "ATTENDANCE_OPERATOR" : "DUTY_ASSIGNMENT";
}

async function requireMarkingPermission(
  ctx: TenantContext,
  scope: { branchId: string; academicYearId: string }
) {
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MARKING, operation: "WRITE" }
  ], { branchId: scope.branchId });
  await requirePermission({
    ctx,
    permission: "academia.attendance.mark",
    branchId: scope.branchId,
    academicYearId: scope.academicYearId
  });
}

export async function resolveStudentAttendanceResponsibility(
  ctx: TenantContext,
  input: {
    branchId: string;
    academicYearId: string;
    classSectionId: string;
    classTeacherUserId: string | null;
    attendanceDate: Date;
    delegationReason?: string | null;
  }
): Promise<StudentAttendanceResponsibility> {
  const actor = ensureAttendanceContext(ctx);
  await requireMarkingPermission(ctx, input);
  const attendanceDate = normalizeAttendanceDate(input.attendanceDate);

  if (input.classTeacherUserId === actor.userId) {
    return {
      responsibleUserId: actor.userId,
      responsibilitySource: "CLASS_TEACHER",
      originalClassTeacherUserId: input.classTeacherUserId,
      delegatedByUserId: null,
      delegationReason: input.delegationReason?.trim() || null,
      assignmentId: null,
      assignmentType: null
    };
  }

  const now = new Date();
  const assignment = await db.studentAttendanceDutyAssignment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      classSectionId: input.classSectionId,
      attendanceDate,
      sessionType: "FULL_DAY",
      assignedUserId: actor.userId,
      status: { in: [...USABLE_DUTY_STATUSES] },
      startsAt: { lte: now },
      expiresAt: { gt: now }
    },
    select: {
      id: true,
      assignmentType: true,
      reasonText: true,
      assignedByUserId: true
    },
    orderBy: [{ priority: "asc" }, { assignedAt: "desc" }]
  });
  if (assignment) {
    return {
      responsibleUserId: actor.userId,
      responsibilitySource: assignmentResponsibilitySource(assignment.assignmentType),
      originalClassTeacherUserId: input.classTeacherUserId,
      delegatedByUserId: assignment.assignedByUserId,
      delegationReason: assignment.reasonText,
      assignmentId: assignment.id,
      assignmentType: assignment.assignmentType
    };
  }

  const unavailableDuty = await db.studentAttendanceDutyAssignment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      classSectionId: input.classSectionId,
      attendanceDate,
      sessionType: "FULL_DAY",
      assignedUserId: actor.userId,
      status: { in: [...LIVE_DUTY_STATUSES] }
    },
    select: { status: true, startsAt: true, expiresAt: true }
  });
  if (unavailableDuty?.status === "PENDING") {
    throw conflict("ATTENDANCE_DUTY_ACKNOWLEDGEMENT_REQUIRED");
  }
  if (unavailableDuty) throw forbidden("ATTENDANCE_DUTY_OUTSIDE_ACTIVE_WINDOW");

  const permissions = await getEffectivePermissions({
    ctx,
    branchId: input.branchId,
    academicYearId: input.academicYearId
  });
  const isPrincipal = (ctx.roleCodes ?? []).some((code) =>
    ["PRINCIPAL", "SCHOOL_ADMIN", "INSTITUTION_ADMIN"].includes(code)
  );
  if (isPrincipal && permissions.has("academia.attendance.update")) {
    const reason = input.delegationReason?.trim();
    if (!reason || reason.length < 5) throw validationError("ATTENDANCE_TAKEOVER_REASON_REQUIRED");
    return {
      responsibleUserId: actor.userId,
      responsibilitySource: "PRINCIPAL_OVERRIDE",
      originalClassTeacherUserId: input.classTeacherUserId,
      delegatedByUserId: actor.userId,
      delegationReason: reason,
      assignmentId: null,
      assignmentType: null
    };
  }

  throw forbidden("ATTENDANCE_RESPONSIBILITY_REQUIRED");
}

export async function requireStudentAttendanceSessionResponsibility(
  ctx: TenantContext,
  session: AttendanceResponsibilitySessionScope
) {
  const actor = ensureAttendanceContext(ctx);
  await requireMarkingPermission(ctx, session);
  if (session.responsibleUserId !== actor.userId) {
    throw forbidden("ATTENDANCE_SESSION_ASSIGNED_TO_ANOTHER_USER");
  }

  if (session.responsibilitySource === "CLASS_TEACHER") return;
  if (session.responsibilitySource === "PRINCIPAL_OVERRIDE") {
    await requirePermission({
      ctx,
      permission: "academia.attendance.update",
      branchId: session.branchId,
      academicYearId: session.academicYearId
    });
    return;
  }

  const now = new Date();
  const duty = await db.studentAttendanceDutyAssignment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: session.branchId,
      academicYearId: session.academicYearId,
      classSectionId: session.classSectionId,
      attendanceDate: normalizeAttendanceDate(session.attendanceDate),
      assignedUserId: actor.userId,
      status: { in: [...USABLE_DUTY_STATUSES] },
      startsAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ sessionId: session.id }, { sessionId: null }]
    },
    select: { id: true }
  });
  if (!duty) throw forbidden("ATTENDANCE_DUTY_NO_LONGER_ACTIVE");
}

export async function applyStudentAttendanceResponsibilityTransfer(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  session: AttendanceResponsibilitySessionScope,
  responsibility: StudentAttendanceResponsibility
) {
  const now = new Date();
  if (responsibility.assignmentId) {
    const linked = await tx.studentAttendanceDutyAssignment.updateMany({
      where: {
        id: responsibility.assignmentId,
        tenantId: ctx.tenantId,
        assignedUserId: responsibility.responsibleUserId,
        status: { in: [...USABLE_DUTY_STATUSES] },
        expiresAt: { gt: now }
      },
      data: {
        sessionId: session.id,
        status: "ACTIVE",
        activatedAt: now
      }
    });
    if (linked.count !== 1) throw conflict("ATTENDANCE_DUTY_STATUS_CHANGED");
  }

  if (session.responsibleUserId === responsibility.responsibleUserId &&
      session.responsibilitySource === responsibility.responsibilitySource) {
    return false;
  }
  if (["COMPLETED", "LOCKED"].includes(session.state)) {
    throw conflict("ATTENDANCE_SESSION_RESPONSIBILITY_LOCKED");
  }

  const reason = responsibility.delegationReason?.trim();
  if (!reason || reason.length < 5) throw validationError("ATTENDANCE_TAKEOVER_REASON_REQUIRED");
  const updated = await tx.studentAttendanceSession.updateMany({
    where: {
      id: session.id,
      tenantId: ctx.tenantId,
      responsibleUserId: session.responsibleUserId,
      responsibilitySource: session.responsibilitySource,
      state: { in: ["DRAFT", "IN_PROGRESS", "REOPENED"] }
    },
    data: {
      responsibleUserId: responsibility.responsibleUserId,
      responsibilitySource: responsibility.responsibilitySource,
      originalClassTeacherUserId: responsibility.originalClassTeacherUserId,
      delegatedByUserId: responsibility.delegatedByUserId,
      delegationReason: reason,
      responsibilityTransferredAt: now,
      sessionVersion: { increment: 1 }
    }
  });
  if (updated.count !== 1) throw conflict("STUDENT_ATTENDANCE_VERSION_CONFLICT");

  await writeAuditLog({
    ctx,
    action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_RESPONSIBILITY_TRANSFERRED,
    entityType: "StudentAttendanceSession",
    entityId: session.id,
    branchId: session.branchId,
    academicYearId: session.academicYearId,
    before: {
      responsibleUserId: session.responsibleUserId,
      responsibilitySource: session.responsibilitySource
    },
    after: {
      responsibleUserId: responsibility.responsibleUserId,
      responsibilitySource: responsibility.responsibilitySource,
      responsibilityTransferredAt: now
    },
    metadata: {
      classSectionId: session.classSectionId,
      attendanceDate: attendanceDateString(session.attendanceDate),
      assignmentId: responsibility.assignmentId,
      reason
    }
  }, tx);
  return true;
}

export async function activateStudentAttendanceDutyForNewSession(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  input: { sessionId: string; responsibility: StudentAttendanceResponsibility }
) {
  if (!input.responsibility.assignmentId) return;
  const updated = await tx.studentAttendanceDutyAssignment.updateMany({
    where: {
      id: input.responsibility.assignmentId,
      tenantId: ctx.tenantId,
      assignedUserId: input.responsibility.responsibleUserId,
      status: { in: [...USABLE_DUTY_STATUSES] },
      expiresAt: { gt: new Date() }
    },
    data: { sessionId: input.sessionId, status: "ACTIVE", activatedAt: new Date() }
  });
  if (updated.count !== 1) throw conflict("ATTENDANCE_DUTY_STATUS_CHANGED");
}

export async function completeStudentAttendanceDutyForSession(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  session: AttendanceResponsibilitySessionScope
) {
  if (!["DUTY_ASSIGNMENT", "ATTENDANCE_OPERATOR"].includes(session.responsibilitySource)) return;
  const now = new Date();
  const duties = await tx.studentAttendanceDutyAssignment.findMany({
    where: {
      tenantId: ctx.tenantId,
      sessionId: session.id,
      assignedUserId: ctx.userId,
      status: { in: [...USABLE_DUTY_STATUSES] }
    },
    select: { id: true, status: true, assignmentType: true }
  });
  if (!duties.length) throw notFound("ATTENDANCE_DUTY_NOT_FOUND");
  await tx.studentAttendanceDutyAssignment.updateMany({
    where: { id: { in: duties.map((duty) => duty.id) }, tenantId: ctx.tenantId },
    data: { status: "COMPLETED", completedAt: now }
  });
  for (const duty of duties) {
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_COMPLETED_BY_DELEGATE,
      entityType: "StudentAttendanceSession",
      entityId: session.id,
      branchId: session.branchId,
      academicYearId: session.academicYearId,
      before: { dutyStatus: duty.status },
      after: { dutyStatus: "COMPLETED", completedAt: now },
      metadata: {
        dutyAssignmentId: duty.id,
        assignmentType: duty.assignmentType,
        classSectionId: session.classSectionId,
        attendanceDate: attendanceDateString(session.attendanceDate)
      }
    }, tx);
  }
}

export async function listAssignedAttendanceClassSectionIds(
  ctx: TenantContext,
  attendanceDate: Date
) {
  const scope = ensureAttendanceContext(ctx);
  const now = new Date();
  const duties = await db.studentAttendanceDutyAssignment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      attendanceDate: normalizeAttendanceDate(attendanceDate),
      assignedUserId: scope.userId,
      status: { in: [...USABLE_DUTY_STATUSES] },
      startsAt: { lte: now },
      expiresAt: { gt: now }
    },
    select: { classSectionId: true }
  });
  return [...new Set(duties.map((duty) => duty.classSectionId))];
}
