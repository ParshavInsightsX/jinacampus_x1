import {
  InAppNotificationAudienceType,
  InAppNotificationCategory,
  InAppNotificationPriority,
  InAppNotificationSourceModule,
  Prisma,
  StudentAttendanceDutyAssignmentStatus
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  createStudentAttendanceDutyAssignmentSchema,
  declineStudentAttendanceDutySchema,
  revokeStudentAttendanceDutySchema,
  studentAttendanceCoverageFilterSchema,
  studentAttendanceDutyIdSchema
} from "@/modules/academia/schemas";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { queueInAppNotificationEvent } from "@/modules/notifications/services/in-app-notification.service";
import {
  LIVE_DUTY_STATUSES,
  attendanceDateString,
  dutyUserName,
  ensureAttendanceContext,
  fullDayDutyWindow,
  loadDutyClassSection,
  loadEligibleDutyUser,
  normalizeAttendanceDate,
  requireCoverageManager
} from "./student-attendance-duty.shared";
import { conflict, validationError } from "./shared";

const ATTENDANCE_DUTY_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 60_000
} as const;

const ASSIGNMENT_LABELS = {
  CO_CLASS_TEACHER: "Co-class teacher",
  SUBSTITUTE_TEACHER: "Substitute teacher",
  PERIOD_TEACHER: "Period teacher",
  ATTENDANCE_OPERATOR: "Attendance operator"
} as const;

export type StudentAttendanceCoverageView = {
  attendanceDate: string;
  sessionType: "FULL_DAY";
  canManageCoverage: boolean;
  summary: { total: number; completed: number; covered: number; needsCoverage: number };
  classes: Array<{
    classSectionId: string;
    classSectionName: string;
    classTeacherName: string | null;
    sessionId: string | null;
    sessionState: string | null;
    responsibleUserName: string | null;
    responsibilitySource: string | null;
    canOpenAttendance: boolean;
    duty: null | {
      id: string;
      assignedUserId: string;
      assignedUserName: string;
      assignmentType: keyof typeof ASSIGNMENT_LABELS;
      assignmentLabel: string;
      status: string;
      reasonText: string | null;
      startsAt: string;
      expiresAt: string;
      isMine: boolean;
    };
    coverageState: "COMPLETED" | "COVERED" | "CLASS_TEACHER" | "NEEDS_COVERAGE";
  }>;
  candidates: Array<{
    userId: string;
    displayName: string;
    employeeCode: string;
    roleCodes: string[];
  }>;
};

function isConcurrencyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034");
}

async function queueDutyNotification(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  input: {
    assignmentId: string;
    userId: string;
    classSectionName: string;
    attendanceDate: Date;
    assignmentType: keyof typeof ASSIGNMENT_LABELS;
  }
) {
  const scopedContext = { ...ctx, activeBranchId: ctx.activeBranchId };
  await queueInAppNotificationEvent(scopedContext, {
    eventId: input.assignmentId,
    eventType: "student_attendance.duty_assigned",
    sourceModule: InAppNotificationSourceModule.ACADEMIA,
    sourceEntityType: "StudentAttendanceDutyAssignment",
    sourceEntityId: input.assignmentId,
    category: InAppNotificationCategory.ATTENDANCE,
    priority: InAppNotificationPriority.HIGH,
    title: "Student attendance duty assigned",
    bodyPreview: `${ASSIGNMENT_LABELS[input.assignmentType]} duty for ${input.classSectionName} on ${attendanceDateString(input.attendanceDate)}. Review and acknowledge the duty.`,
    audience: { type: InAppNotificationAudienceType.USER, userId: input.userId },
    deepLink: `/academia/attendance/coverage?date=${attendanceDateString(input.attendanceDate)}`,
    requiresAcknowledgement: true,
    safeMetadata: {
      assignmentId: input.assignmentId,
      classSectionName: input.classSectionName,
      attendanceDate: attendanceDateString(input.attendanceDate)
    },
    idempotencyKey: `attendance-duty:${input.assignmentId}:assigned`
  }, tx);
}

export async function expireStaleStudentAttendanceDuties(ctx: TenantContext, now = new Date()) {
  const scope = ensureAttendanceContext(ctx);
  const stale = await db.studentAttendanceDutyAssignment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      status: { in: [...LIVE_DUTY_STATUSES] },
      expiresAt: { lte: now }
    },
    select: { id: true, classSectionId: true, assignedUserId: true, status: true }
  });
  if (!stale.length) return 0;

  return db.$transaction(async (tx) => {
    let expiredCount = 0;
    for (const duty of stale) {
      const updated = await tx.studentAttendanceDutyAssignment.updateMany({
        where: {
          id: duty.id,
          tenantId: ctx.tenantId,
          status: { in: [...LIVE_DUTY_STATUSES] },
          expiresAt: { lte: now }
        },
        data: { status: StudentAttendanceDutyAssignmentStatus.EXPIRED }
      });
      if (updated.count !== 1) continue;
      expiredCount += 1;
      await writeAuditLog({
        ctx,
        action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_EXPIRED,
        entityType: "StudentAttendanceDutyAssignment",
        entityId: duty.id,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        before: { status: duty.status },
        after: { status: "EXPIRED" },
        metadata: { classSectionId: duty.classSectionId, assignedUserId: duty.assignedUserId }
      }, tx);
    }
    return expiredCount;
  }, ATTENDANCE_DUTY_TRANSACTION_OPTIONS);
}

export async function createStudentAttendanceDutyAssignment(ctx: TenantContext, input: unknown) {
  const data = createStudentAttendanceDutyAssignmentSchema.parse(input);
  const scope = await requireCoverageManager(ctx);
  const attendanceDate = normalizeAttendanceDate(data.attendanceDate);
  const classSection = await loadDutyClassSection(db, ctx, data.classSectionId);
  const assignedUser = await loadEligibleDutyUser(db, ctx, {
    assignedUserId: data.assignedUserId,
    branchId: classSection.branchId,
    assignmentType: data.assignmentType
  });
  if (assignedUser.id === classSection.classTeacherUserId) {
    throw validationError("ATTENDANCE_DUTY_CLASS_TEACHER_ALREADY_RESPONSIBLE");
  }

  const fullDayWindow = fullDayDutyWindow(attendanceDate, classSection.branch.timezone ?? ctx.timeZone);
  const startsAt = data.startsAt ?? fullDayWindow.startsAt;
  const expiresAt = data.expiresAt ?? fullDayWindow.expiresAt;
  if (startsAt < fullDayWindow.startsAt || expiresAt > fullDayWindow.expiresAt) {
    throw validationError("ATTENDANCE_DUTY_WINDOW_OUTSIDE_SCHOOL_DAY");
  }
  if (expiresAt <= new Date()) throw validationError("ATTENDANCE_DUTY_WINDOW_EXPIRED");

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.studentAttendanceDutyAssignment.findMany({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: scope.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: data.sessionType,
          status: { in: [...LIVE_DUTY_STATUSES] }
        },
        select: { id: true, assignedUserId: true, assignmentType: true, status: true }
      });
      if (existing.length && !data.replaceExisting) {
        throw conflict("ATTENDANCE_DUTY_ALREADY_ASSIGNED");
      }

      for (const previous of existing) {
        await tx.studentAttendanceDutyAssignment.update({
          where: { id: previous.id },
          data: {
            status: "REVOKED",
            revokedByUserId: scope.userId,
            revokedAt: new Date(),
            revocationReason: `Reassigned: ${data.reasonText}`
          }
        });
        await writeAuditLog({
          ctx,
          action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_REASSIGNED,
          entityType: "StudentAttendanceDutyAssignment",
          entityId: previous.id,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          before: previous,
          after: { status: "REVOKED", replacementUserId: assignedUser.id },
          metadata: { classSectionId: classSection.id, attendanceDate: attendanceDateString(attendanceDate) }
        }, tx);
      }

      const assignment = await tx.studentAttendanceDutyAssignment.create({
        data: {
          tenantId: ctx.tenantId,
          institutionId: classSection.branch.institutionId,
          branchId: classSection.branchId,
          academicYearId: classSection.academicYearId,
          classSectionId: classSection.id,
          attendanceDate,
          sessionType: data.sessionType,
          assignedUserId: assignedUser.id,
          assignmentType: data.assignmentType,
          status: "PENDING",
          reasonCode: data.reasonCode,
          reasonText: data.reasonText,
          sourceType: data.sourceType,
          sourceEntityId: data.sourceEntityId,
          assignedByUserId: scope.userId,
          startsAt,
          expiresAt
        },
        select: { id: true, status: true, assignedAt: true }
      });

      await writeAuditLog({
        ctx,
        action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_ASSIGNED,
        entityType: "StudentAttendanceDutyAssignment",
        entityId: assignment.id,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        after: {
          assignedUserId: assignedUser.id,
          assignmentType: data.assignmentType,
          status: assignment.status,
          startsAt,
          expiresAt
        },
        metadata: {
          classSectionId: classSection.id,
          attendanceDate: attendanceDateString(attendanceDate),
          reasonCode: data.reasonCode,
          sourceType: data.sourceType
        }
      }, tx);
      await queueDutyNotification(tx, ctx, {
        assignmentId: assignment.id,
        userId: assignedUser.id,
        classSectionName: classSection.displayName,
        attendanceDate,
        assignmentType: data.assignmentType
      });
      return assignment;
    }, ATTENDANCE_DUTY_TRANSACTION_OPTIONS);
  } catch (error) {
    if (isConcurrencyConflict(error)) throw conflict("ATTENDANCE_DUTY_ALREADY_ASSIGNED");
    throw error;
  }
}

async function loadMyDuty(ctx: TenantContext, assignmentId: string) {
  const scope = ensureAttendanceContext(ctx);
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
  const duty = await db.studentAttendanceDutyAssignment.findFirst({
    where: {
      id: assignmentId,
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      assignedUserId: scope.userId
    }
  });
  if (!duty) throw notFound("ATTENDANCE_DUTY_NOT_FOUND");
  return { duty, scope };
}

export async function acknowledgeStudentAttendanceDuty(ctx: TenantContext, input: unknown) {
  const data = studentAttendanceDutyIdSchema.parse(input);
  const { duty, scope } = await loadMyDuty(ctx, data.assignmentId);
  if (duty.expiresAt <= new Date()) throw validationError("ATTENDANCE_DUTY_WINDOW_EXPIRED");
  if (duty.status !== "PENDING") throw conflict("ATTENDANCE_DUTY_NOT_PENDING");
  const now = new Date();
  const status = duty.startsAt <= now ? "ACTIVE" : "ACKNOWLEDGED";
  return db.$transaction(async (tx) => {
    const updated = await tx.studentAttendanceDutyAssignment.updateMany({
      where: { id: duty.id, tenantId: ctx.tenantId, assignedUserId: scope.userId, status: "PENDING" },
      data: {
        status,
        acknowledgedAt: now,
        ...(status === "ACTIVE" ? { activatedAt: now } : {})
      }
    });
    if (updated.count !== 1) throw conflict("ATTENDANCE_DUTY_STATUS_CHANGED");
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_ACKNOWLEDGED,
      entityType: "StudentAttendanceDutyAssignment",
      entityId: duty.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      before: { status: duty.status },
      after: { status, acknowledgedAt: now },
      metadata: { classSectionId: duty.classSectionId, attendanceDate: attendanceDateString(duty.attendanceDate) }
    }, tx);
    return { id: duty.id, status };
  }, ATTENDANCE_DUTY_TRANSACTION_OPTIONS);
}

export async function declineStudentAttendanceDuty(ctx: TenantContext, input: unknown) {
  const data = declineStudentAttendanceDutySchema.parse(input);
  const { duty, scope } = await loadMyDuty(ctx, data.assignmentId);
  if (!["PENDING", "ACKNOWLEDGED", "ACTIVE"].includes(duty.status)) {
    throw conflict("ATTENDANCE_DUTY_STATUS_CHANGED");
  }
  const now = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.studentAttendanceDutyAssignment.updateMany({
      where: {
        id: duty.id,
        tenantId: ctx.tenantId,
        assignedUserId: scope.userId,
        status: { in: [...LIVE_DUTY_STATUSES] }
      },
      data: { status: "DECLINED", declinedAt: now, declineReason: data.reason }
    });
    if (updated.count !== 1) throw conflict("ATTENDANCE_DUTY_STATUS_CHANGED");
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_DECLINED,
      entityType: "StudentAttendanceDutyAssignment",
      entityId: duty.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      before: { status: duty.status },
      after: { status: "DECLINED", declinedAt: now },
      metadata: { classSectionId: duty.classSectionId, reason: data.reason }
    }, tx);
    return { id: duty.id, status: "DECLINED" as const };
  }, ATTENDANCE_DUTY_TRANSACTION_OPTIONS);
}

export async function revokeStudentAttendanceDuty(ctx: TenantContext, input: unknown) {
  const data = revokeStudentAttendanceDutySchema.parse(input);
  const scope = await requireCoverageManager(ctx);
  const duty = await db.studentAttendanceDutyAssignment.findFirst({
    where: {
      id: data.assignmentId,
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      status: { in: [...LIVE_DUTY_STATUSES] }
    }
  });
  if (!duty) throw notFound("ATTENDANCE_DUTY_NOT_FOUND");
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.studentAttendanceDutyAssignment.update({
      where: { id: duty.id },
      data: {
        status: "REVOKED",
        revokedByUserId: scope.userId,
        revokedAt: now,
        revocationReason: data.reason
      }
    });
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_DUTY_REVOKED,
      entityType: "StudentAttendanceDutyAssignment",
      entityId: duty.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      before: { status: duty.status },
      after: { status: "REVOKED", revokedAt: now },
      metadata: { classSectionId: duty.classSectionId, reason: data.reason }
    }, tx);
    return { id: duty.id, status: "REVOKED" as const };
  }, ATTENDANCE_DUTY_TRANSACTION_OPTIONS);
}

export async function listStudentAttendanceCoverage(
  ctx: TenantContext,
  input: unknown
): Promise<StudentAttendanceCoverageView> {
  const data = studentAttendanceCoverageFilterSchema.parse(input);
  const scope = ensureAttendanceContext(ctx);
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" }
  ], { branchId: scope.branchId });
  await requirePermission({
    ctx,
    permission: "academia.attendance.view",
    branchId: scope.branchId,
    academicYearId: scope.academicYearId
  });
  const permissions = await getEffectivePermissions({
    ctx,
    branchId: scope.branchId,
    academicYearId: scope.academicYearId
  });
  const canManageCoverage = permissions.has("academia.attendance.coverage.manage");
  const attendanceDate = normalizeAttendanceDate(data.attendanceDate);
  await expireStaleStudentAttendanceDuties(ctx);

  const [classSections, duties, sessions, candidates] = await Promise.all([
    db.classSection.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        status: "ACTIVE",
        ...(canManageCoverage ? {} : {
          OR: [
            { classTeacherUserId: scope.userId },
            {
              studentAttendanceDutyAssignments: {
                some: {
                  assignedUserId: scope.userId,
                  attendanceDate,
                  status: { in: [...LIVE_DUTY_STATUSES] }
                }
              }
            }
          ]
        })
      },
      select: {
        id: true,
        displayName: true,
        classTeacherUserId: true,
        classTeacherUser: {
          select: { displayName: true, firstName: true, lastName: true, email: true }
        },
        academicClass: { select: { sortOrder: true } },
        section: { select: { sortOrder: true } }
      },
      orderBy: [{ academicClass: { sortOrder: "asc" } }, { section: { sortOrder: "asc" } }]
    }),
    db.studentAttendanceDutyAssignment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate,
        sessionType: data.sessionType,
        status: { in: [...LIVE_DUTY_STATUSES] }
      },
      select: {
        id: true,
        classSectionId: true,
        assignedUserId: true,
        assignmentType: true,
        status: true,
        reasonText: true,
        startsAt: true,
        expiresAt: true,
        assignedUser: {
          select: { displayName: true, firstName: true, lastName: true, email: true }
        }
      }
    }),
    db.studentAttendanceSession.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        attendanceDate,
        sessionType: data.sessionType
      },
      select: {
        id: true,
        classSectionId: true,
        state: true,
        responsibleUserId: true,
        responsibilitySource: true,
        responsibleUser: {
          select: { displayName: true, firstName: true, lastName: true, email: true }
        }
      }
    }),
    canManageCoverage ? db.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        branchAccesses: { some: { tenantId: ctx.tenantId, branchId: scope.branchId, isActive: true } },
        staffProfile: { is: { employmentStatus: "ACTIVE" } },
        roleAssignments: {
          some: {
            tenantId: ctx.tenantId,
            isActive: true,
            role: {
              tenantId: ctx.tenantId,
              isActive: true,
              code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TEACHER", "CLASS_TEACHER"] }
            }
          }
        }
      },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        email: true,
        staffProfile: { select: { employeeCode: true } },
        roleAssignments: { where: { tenantId: ctx.tenantId, isActive: true }, select: { role: { select: { code: true } } } }
      },
      orderBy: [{ displayName: "asc" }, { firstName: "asc" }]
    }) : Promise.resolve([])
  ]);

  const dutyByClass = new Map(duties.map((duty) => [duty.classSectionId, duty]));
  const sessionByClass = new Map(sessions.map((session) => [session.classSectionId, session]));
  const isPrincipalOverrideAllowed = (ctx.roleCodes ?? []).some((code) =>
    ["PRINCIPAL", "SCHOOL_ADMIN", "INSTITUTION_ADMIN"].includes(code)
  ) && permissions.has("academia.attendance.update");
  const now = new Date();
  const classes = classSections.map((classSection) => {
    const duty = dutyByClass.get(classSection.id) ?? null;
    const session = sessionByClass.get(classSection.id) ?? null;
    const coverageState = session?.state === "COMPLETED" || session?.state === "LOCKED"
      ? "COMPLETED"
      : duty
        ? "COVERED"
        : classSection.classTeacherUserId
          ? "CLASS_TEACHER"
          : "NEEDS_COVERAGE";
    return {
      classSectionId: classSection.id,
      classSectionName: classSection.displayName,
      classTeacherName: classSection.classTeacherUser ? dutyUserName(classSection.classTeacherUser) : null,
      sessionId: session?.id ?? null,
      sessionState: session?.state ?? null,
      responsibleUserName: session ? dutyUserName(session.responsibleUser) : null,
      responsibilitySource: session?.responsibilitySource ?? null,
      canOpenAttendance:
        classSection.classTeacherUserId === scope.userId ||
        session?.responsibleUserId === scope.userId ||
        isPrincipalOverrideAllowed ||
        Boolean(
          duty?.assignedUserId === scope.userId &&
          ["ACKNOWLEDGED", "ACTIVE"].includes(duty.status) &&
          duty.startsAt <= now &&
          duty.expiresAt > now
        ),
      duty: duty ? {
        id: duty.id,
        assignedUserId: duty.assignedUserId,
        assignedUserName: dutyUserName(duty.assignedUser),
        assignmentType: duty.assignmentType,
        assignmentLabel: ASSIGNMENT_LABELS[duty.assignmentType],
        status: duty.status,
        reasonText: duty.reasonText,
        startsAt: duty.startsAt.toISOString(),
        expiresAt: duty.expiresAt.toISOString(),
        isMine: duty.assignedUserId === scope.userId
      } : null,
      coverageState
    } as StudentAttendanceCoverageView["classes"][number];
  });

  return {
    attendanceDate: attendanceDateString(attendanceDate),
    sessionType: "FULL_DAY",
    canManageCoverage,
    summary: {
      total: classes.length,
      completed: classes.filter((item) => item.coverageState === "COMPLETED").length,
      covered: classes.filter((item) => item.coverageState === "COVERED").length,
      needsCoverage: classes.filter((item) => item.coverageState === "NEEDS_COVERAGE").length
    },
    classes,
    candidates: candidates.map((user) => ({
      userId: user.id,
      displayName: dutyUserName(user),
      employeeCode: user.staffProfile?.employeeCode ?? "-",
      roleCodes: [...new Set(user.roleAssignments.map((assignment) => assignment.role.code))]
    }))
  };
}
