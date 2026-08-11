import type { StudentAttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { hasPlatformAdminRole, hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import {
  buildAttendanceTrendPoints,
  getDashboardTrendDates,
  type DashboardAttendanceTrendPoint
} from "./attendance-trend";
import { activeBranchFilter, resolveDashboardScope } from "./shared";

export type StudentAttendanceDashboardMetrics = {
  date: string;
  marked: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  eligibleClassSections: number;
  classesMarked: number;
  classesNotMarked: number;
  markingRate: number | null;
};

function statusCount(
  groups: Array<{ status: StudentAttendanceStatus; _count: { _all: number } }>,
  status: StudentAttendanceStatus
) {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

function isAssignedTeacherScope(ctx: TenantContext) {
  const roleCodes = ctx.roleCodes ?? [];
  return hasTeacherRole(roleCodes) &&
    !hasPrincipalRole(roleCodes) &&
    !hasPlatformAdminRole(roleCodes);
}

export async function getStudentAttendanceDashboardMetrics(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StudentAttendanceDashboardMetrics> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);
  const teacherScope = isAssignedTeacherScope(ctx);
  const assignedClassSection = teacherScope
    ? { classTeacherUserId: ctx.userId }
    : {};
  if (!scope.activeAcademicYearId) {
    return {
      date: scope.dateString,
      marked: 0,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      eligibleClassSections: 0,
      classesMarked: 0,
      classesNotMarked: 0,
      markingRate: null
    };
  }

  const [statusGroups, classSections, holidayEntries] = await Promise.all([
    db.studentAttendanceRecord.groupBy({
      by: ["status"],
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        academicYearId: scope.activeAcademicYearId,
        attendanceDate: scope.date,
        sessionType: "FULL_DAY",
        ...(teacherScope ? { classSection: assignedClassSection } : {})
      },
      _count: { _all: true }
    }),
    db.classSection.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        academicYearId: scope.activeAcademicYearId,
        status: "ACTIVE",
        ...assignedClassSection
      },
      select: {
        id: true,
        branchId: true,
        enrollments: {
          where: {
            tenantId: ctx.tenantId,
            branchId: branchFilter,
            academicYearId: scope.activeAcademicYearId,
            status: "ACTIVE",
            enrolledOn: { lte: scope.date },
            OR: [{ leftOn: null }, { leftOn: { gte: scope.date } }],
            student: {
              tenantId: ctx.tenantId,
              branchId: branchFilter,
              status: "ACTIVE"
            }
          },
          select: { studentId: true }
        },
        studentAttendanceRecords: {
          where: {
            tenantId: ctx.tenantId,
            branchId: branchFilter,
            academicYearId: scope.activeAcademicYearId,
            attendanceDate: scope.date,
            sessionType: "FULL_DAY"
          },
          select: { studentId: true }
        }
      }
    }),
    db.academicCalendarEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        academicYearId: scope.activeAcademicYearId,
        status: "ACTIVE",
        startDate: { lte: scope.date },
        endDate: { gte: scope.date },
        audiences: { has: "STUDENTS" },
        OR: [{ branchId: null }, { branchId: branchFilter }]
      },
      select: { branchId: true }
    })
  ]);

  const marked = statusGroups.reduce((total, group) => total + group._count._all, 0);
  const institutionWideHoliday = holidayEntries.some((entry) => entry.branchId === null);
  const holidayBranchIds = new Set(holidayEntries.flatMap((entry) => entry.branchId ? [entry.branchId] : []));
  const eligibleClassSections = classSections.filter((classSection) => (
    classSection.enrollments.length > 0 &&
    !institutionWideHoliday &&
    !holidayBranchIds.has(classSection.branchId)
  ));
  const classesNotMarked = eligibleClassSections.filter(
    (classSection) => classSection.enrollments.length > 0 && classSection.studentAttendanceRecords.length === 0
  ).length;
  const classesMarked = eligibleClassSections.length - classesNotMarked;

  return {
    date: scope.dateString,
    marked,
    present: statusCount(statusGroups, "PRESENT"),
    absent: statusCount(statusGroups, "ABSENT"),
    late: statusCount(statusGroups, "LATE"),
    halfDay: statusCount(statusGroups, "HALF_DAY"),
    eligibleClassSections: eligibleClassSections.length,
    classesMarked,
    classesNotMarked,
    markingRate: eligibleClassSections.length > 0
      ? Math.round((classesMarked / eligibleClassSections.length) * 100)
      : null
  };
}

export async function getStudentAttendanceDashboardTrend(
  ctx: TenantContext,
  input: unknown = {}
): Promise<DashboardAttendanceTrendPoint[]> {
  const scope = await resolveDashboardScope(ctx, input);
  const dates = getDashboardTrendDates(scope.date);
  if (!scope.activeAcademicYearId) return buildAttendanceTrendPoints(dates, []);

  const branchFilter = activeBranchFilter(scope);
  const teacherScope = isAssignedTeacherScope(ctx);
  const groups = await db.studentAttendanceRecord.groupBy({
    by: ["attendanceDate", "status"],
    where: {
      tenantId: ctx.tenantId,
      branchId: branchFilter,
      academicYearId: scope.activeAcademicYearId,
      attendanceDate: { gte: dates[0], lte: scope.date },
      sessionType: "FULL_DAY",
      ...(teacherScope ? { classSection: { classTeacherUserId: ctx.userId } } : {})
    },
    _count: { _all: true },
    orderBy: { attendanceDate: "asc" }
  });

  return buildAttendanceTrendPoints(dates, groups);
}
