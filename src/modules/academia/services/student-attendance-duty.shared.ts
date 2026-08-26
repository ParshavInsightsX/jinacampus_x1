import {
  StudentAttendanceDutyAssignmentStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { getZonedDateTimeParts, safeTimeZone } from "@/lib/dates/time-zone";
import { forbidden, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { validationError } from "./shared";

export type AttendanceDutyDb = PrismaClient | Prisma.TransactionClient;

export const LIVE_DUTY_STATUSES = [
  StudentAttendanceDutyAssignmentStatus.PENDING,
  StudentAttendanceDutyAssignmentStatus.ACKNOWLEDGED,
  StudentAttendanceDutyAssignmentStatus.ACTIVE
] as const;

export const USABLE_DUTY_STATUSES = [
  StudentAttendanceDutyAssignmentStatus.ACKNOWLEDGED,
  StudentAttendanceDutyAssignmentStatus.ACTIVE
] as const;

export function normalizeAttendanceDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function attendanceDateString(date: Date) {
  return normalizeAttendanceDate(date).toISOString().slice(0, 10);
}

function localDateTimeToUtc(input: Date, hour: number, timeZone: string) {
  const expected = Date.UTC(
    input.getUTCFullYear(),
    input.getUTCMonth(),
    input.getUTCDate(),
    hour,
    0,
    0
  );
  let candidate = expected;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = getZonedDateTimeParts(new Date(candidate), timeZone);
    const observedUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    candidate += expected - observedUtc;
  }
  return new Date(candidate);
}

export function fullDayDutyWindow(attendanceDate: Date, requestedTimeZone?: string | null) {
  const date = normalizeAttendanceDate(attendanceDate);
  const timeZone = safeTimeZone(requestedTimeZone);
  const startsAt = localDateTimeToUtc(date, 0, timeZone);
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return { startsAt, expiresAt: localDateTimeToUtc(nextDate, 0, timeZone) };
}

export function ensureAttendanceContext(ctx: TenantContext) {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  if (!ctx.activeBranchId) throw validationError("ACTIVE_BRANCH_REQUIRED");
  if (!ctx.activeAcademicYearId) throw validationError("ACTIVE_ACADEMIC_YEAR_REQUIRED");
  return {
    userId: ctx.userId,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  };
}

export async function requireCoverageManager(ctx: TenantContext) {
  const scope = ensureAttendanceContext(ctx);
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MARKING, operation: "WRITE" }
  ], { branchId: scope.branchId });
  await requirePermission({
    ctx,
    permission: "academia.attendance.coverage.manage",
    branchId: scope.branchId,
    academicYearId: scope.academicYearId
  });
  return scope;
}

export async function loadDutyClassSection(
  client: AttendanceDutyDb,
  ctx: TenantContext,
  classSectionId: string
) {
  const scope = ensureAttendanceContext(ctx);
  const classSection = await client.classSection.findFirst({
    where: {
      id: classSectionId,
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      status: "ACTIVE"
    },
    select: {
      id: true,
      displayName: true,
      branchId: true,
      academicYearId: true,
      classTeacherUserId: true,
      branch: {
        select: {
          institutionId: true,
          timezone: true,
          name: true
        }
      }
    }
  });
  if (!classSection) throw notFound("CLASS_SECTION_NOT_FOUND");
  return classSection;
}

export async function loadEligibleDutyUser(
  client: AttendanceDutyDb,
  ctx: TenantContext,
  input: { assignedUserId: string; branchId: string; assignmentType: string }
) {
  const now = new Date();
  const allowedRoles = input.assignmentType === "ATTENDANCE_OPERATOR"
    ? ["OFFICE_STAFF", "PRINCIPAL"]
    : ["TEACHER", "CLASS_TEACHER", "PRINCIPAL"];
  const user = await client.user.findFirst({
    where: {
      id: input.assignedUserId,
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      branchAccesses: {
        some: { tenantId: ctx.tenantId, branchId: input.branchId, isActive: true }
      },
      roleAssignments: {
        some: {
          tenantId: ctx.tenantId,
          isActive: true,
          role: { tenantId: ctx.tenantId, isActive: true, code: { in: allowedRoles } },
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
          ]
        }
      }
    },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      email: true,
      staffProfile: {
        select: { id: true, employeeCode: true, employmentStatus: true }
      }
    }
  });
  if (!user) throw forbidden("ATTENDANCE_DUTY_USER_NOT_ELIGIBLE");
  if (!user.staffProfile || user.staffProfile.employmentStatus !== "ACTIVE") {
    throw forbidden("ATTENDANCE_DUTY_STAFF_PROFILE_REQUIRED");
  }
  return user;
}

export function dutyUserName(user: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
  email: string;
}) {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}
