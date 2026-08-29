import type { StaffAttendanceStatus, StaffType } from "@prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import {
  buildAttendanceTrendPoints,
  getDashboardTrendDates,
  type DashboardAttendanceTrendPoint
} from "./attendance-trend";
import { activeBranchFilter, resolveDashboardScope } from "./shared";

export type StaffBoardDashboardMetrics = {
  totalActiveStaff: number;
  totalTeachers: number;
  totalNonTeachingStaff: number;
  activeStaffByType: Partial<Record<StaffType, number>>;
};

export type StaffAttendanceDashboardMetrics = {
  date: string;
  checkedIn: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  notMarked: number;
  notMarkedOrAbsent: number;
};

function staffAttendanceStatusCount(
  groups: Array<{ status: StaffAttendanceStatus; _count: { _all: number } }>,
  status: StaffAttendanceStatus
) {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

export async function getStaffBoardDashboardMetrics(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StaffBoardDashboardMetrics> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);

  const staffTypeGroups = await db.staffProfile.groupBy({
    by: ["staffType"],
    where: {
      tenantId: ctx.tenantId,
      branchId: branchFilter,
      employmentStatus: "ACTIVE"
    },
    _count: { _all: true }
  });
  const totalActiveStaff = staffTypeGroups.reduce((total, group) => total + group._count._all, 0);
  const totalTeachers = staffTypeGroups.find((group) => group.staffType === "TEACHER")?._count._all ?? 0;
  const totalNonTeachingStaff = totalActiveStaff - totalTeachers;

  return {
    totalActiveStaff,
    totalTeachers,
    totalNonTeachingStaff,
    activeStaffByType: Object.fromEntries(staffTypeGroups.map((group) => [group.staffType, group._count._all]))
  };
}

export async function getStaffAttendanceDashboardMetrics(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StaffAttendanceDashboardMetrics> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);

  const [totalActiveStaff, checkedIn] = await Promise.all([
    db.staffProfile.count({
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        employmentStatus: "ACTIVE"
      }
    }),
    db.staffAttendanceRecord.count({
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        attendanceDate: scope.date,
        checkInAt: { not: null },
        staff: {
          tenantId: ctx.tenantId,
          branchId: branchFilter,
          employmentStatus: "ACTIVE"
        }
      }
    })
  ]);
  const [attendanceRecordsToday, statusGroups] = await Promise.all([
    db.staffAttendanceRecord.count({
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        attendanceDate: scope.date,
        staff: {
          tenantId: ctx.tenantId,
          branchId: branchFilter,
          employmentStatus: "ACTIVE"
        }
      }
    }),
    db.staffAttendanceRecord.groupBy({
      by: ["status"],
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        attendanceDate: scope.date,
        staff: {
          tenantId: ctx.tenantId,
          branchId: branchFilter,
          employmentStatus: "ACTIVE"
        }
      },
      _count: { _all: true }
    })
  ]);

  const absent = staffAttendanceStatusCount(statusGroups, "ABSENT");
  const notMarked = Math.max(totalActiveStaff - attendanceRecordsToday, 0);

  return {
    date: scope.dateString,
    checkedIn,
    present: staffAttendanceStatusCount(statusGroups, "PRESENT"),
    late: staffAttendanceStatusCount(statusGroups, "LATE"),
    halfDay: staffAttendanceStatusCount(statusGroups, "HALF_DAY"),
    absent,
    notMarked,
    notMarkedOrAbsent: notMarked + absent
  };
}

export async function getStaffAttendanceDashboardTrend(
  ctx: TenantContext,
  input: unknown = {}
): Promise<DashboardAttendanceTrendPoint[]> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);
  const dates = getDashboardTrendDates(scope.date);
  const groups = await db.staffAttendanceRecord.groupBy({
    by: ["attendanceDate", "status"],
    where: {
      tenantId: ctx.tenantId,
      branchId: branchFilter,
      attendanceDate: { gte: dates[0], lte: scope.date },
      staff: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        employmentStatus: "ACTIVE"
      }
    },
    _count: { _all: true },
    orderBy: { attendanceDate: "asc" }
  });

  return buildAttendanceTrendPoints(dates, groups);
}
