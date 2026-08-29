import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import {
  buildAttendanceTrendPoints,
  getAcademiaDashboardMetrics,
  getCampusCoreDashboardMetrics,
  getMvpDashboardSummary,
  getStaffAttendanceDashboardMetrics,
  getStaffAttendanceDashboardTrend,
  getStaffBoardDashboardMetrics,
  getStudentAttendanceDashboardMetrics,
  getStudentAttendanceDashboardTrend
} from "@/modules/dashboard/queries";

const mocks = vi.hoisted(() => {
  const db = {
    branch: { count: vi.fn() },
    academicCalendarEntry: { findMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    user: { count: vi.fn() },
    role: { count: vi.fn() },
    student: { count: vi.fn() },
    enrollment: { count: vi.fn() },
    class: { count: vi.fn() },
    classSection: { count: vi.fn(), findMany: vi.fn() },
    guardian: { count: vi.fn() },
    studentAttendanceRecord: { groupBy: vi.fn() },
    staffProfile: { count: vi.fn(), groupBy: vi.fn() },
    staffAttendanceRecord: { count: vi.fn(), groupBy: vi.fn() }
  };
  const requirePermission = vi.fn();
  return { db, requirePermission };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const secondBranchId = "00000000-0000-0000-0000-000000000013";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const dashboardDate = new Date(Date.UTC(2026, 4, 7));

const ctx: TenantContext = {
  tenantId,
  userId,
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId, secondBranchId],
  activeAcademicYearId: academicYearId
};

function resetDbMocks() {
  mocks.db.academicCalendarEntry.findMany.mockReset();
  mocks.db.branch.count.mockReset();
  mocks.db.academicYear.findFirst.mockReset();
  mocks.db.user.count.mockReset();
  mocks.db.role.count.mockReset();
  mocks.db.student.count.mockReset();
  mocks.db.enrollment.count.mockReset();
  mocks.db.class.count.mockReset();
  mocks.db.classSection.count.mockReset();
  mocks.db.classSection.findMany.mockReset();
  mocks.db.guardian.count.mockReset();
  mocks.db.studentAttendanceRecord.groupBy.mockReset();
  mocks.db.staffProfile.count.mockReset();
  mocks.db.staffProfile.groupBy.mockReset();
  mocks.db.staffAttendanceRecord.count.mockReset();
  mocks.db.staffAttendanceRecord.groupBy.mockReset();
}

function seedDefaultMockResults() {
  mocks.db.academicCalendarEntry.findMany.mockResolvedValue([]);
  mocks.db.branch.count.mockResolvedValue(1);
  mocks.db.academicYear.findFirst.mockResolvedValue({ id: academicYearId, name: "2026-27" });
  mocks.db.user.count.mockResolvedValue(11);
  mocks.db.role.count.mockResolvedValue(4);
  mocks.db.student.count.mockResolvedValue(120);
  mocks.db.enrollment.count.mockResolvedValue(118);
  mocks.db.class.count.mockResolvedValue(8);
  mocks.db.classSection.count.mockResolvedValue(16);
  mocks.db.classSection.findMany.mockResolvedValue([]);
  mocks.db.guardian.count.mockResolvedValue(110);
  mocks.db.studentAttendanceRecord.groupBy.mockResolvedValue([]);
  mocks.db.staffProfile.count.mockResolvedValue(20);
  mocks.db.staffProfile.groupBy.mockResolvedValue([]);
  mocks.db.staffAttendanceRecord.count.mockResolvedValue(0);
  mocks.db.staffAttendanceRecord.groupBy.mockResolvedValue([]);
}

beforeEach(() => {
  resetDbMocks();
  seedDefaultMockResults();
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
});

describe("dashboard query services", () => {
  it("campus dashboard metrics are tenant and branch scoped", async () => {
    const result = await getCampusCoreDashboardMetrics(ctx, { date: "2026-05-07" });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "campuscore.tenant.view",
      branchId
    });
    expect(mocks.db.branch.count).toHaveBeenCalledWith({
      where: {
        tenantId,
        id: { in: [branchId] },
        status: "ACTIVE"
      }
    });
    expect(mocks.db.user.count.mock.calls[0][0].where).toMatchObject({
      tenantId,
      status: "ACTIVE"
    });
    expect(result).toEqual({
      totalBranches: 1,
      activeAcademicYearId: academicYearId,
      activeAcademicYearName: "2026-27",
      totalUsers: 11,
      totalActiveRoles: 4
    });
  });

  it("academia dashboard metrics are tenant scoped and academic-year aware", async () => {
    const result = await getAcademiaDashboardMetrics(ctx, { branchId: secondBranchId });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "campuscore.tenant.view",
      branchId: secondBranchId
    });
    expect(mocks.db.student.count).toHaveBeenCalledWith({
      where: {
        tenantId,
        branchId: { in: [secondBranchId] },
        status: "ACTIVE"
      }
    });
    expect(mocks.db.enrollment.count).toHaveBeenCalledWith({
      where: {
        tenantId,
        branchId: { in: [secondBranchId] },
        academicYearId,
        status: "ACTIVE"
      }
    });
    expect(mocks.db.classSection.count.mock.calls[0][0].where).toMatchObject({
      tenantId,
      branchId: { in: [secondBranchId] },
      academicYearId,
      status: "ACTIVE"
    });
    expect(result).toMatchObject({
      totalActiveStudents: 120,
      totalActiveEnrollments: 118,
      totalClasses: 8,
      totalClassSections: 16,
      totalGuardians: 110
    });
  });

  it("limits teacher dashboard student and class metrics to assigned class sections", async () => {
    const teacherCtx = { ...ctx, roleCodes: ["TEACHER"] };

    await getAcademiaDashboardMetrics(teacherCtx);

    expect(mocks.db.student.count.mock.calls[0][0].where.enrollments.some).toMatchObject({
      tenantId,
      academicYearId,
      status: "ACTIVE",
      classSection: { classTeacherUserId: userId }
    });
    expect(mocks.db.enrollment.count.mock.calls[0][0].where.classSection).toEqual({
      classTeacherUserId: userId
    });
    expect(mocks.db.classSection.count.mock.calls[0][0].where).toMatchObject({
      classTeacherUserId: userId
    });
    expect(mocks.db.class.count.mock.calls[0][0].where.classSections.some).toMatchObject({
      academicYearId,
      classTeacherUserId: userId
    });
    expect(mocks.db.guardian.count.mock.calls[0][0].where.studentLinks.some.student.enrollments.some.classSection)
      .toEqual({ classTeacherUserId: userId });
  });

  it("student attendance dashboard metrics count statuses and ignore no-enrollment sections for not-marked", async () => {
    mocks.db.studentAttendanceRecord.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: { _all: 10 } },
      { status: "ABSENT", _count: { _all: 2 } },
      { status: "LATE", _count: { _all: 3 } },
      { status: "HALF_DAY", _count: { _all: 1 } }
    ]);
    mocks.db.classSection.findMany.mockResolvedValue([
      { id: "section-with-no-enrollment", enrollments: [], studentAttendanceRecords: [] },
      { id: "section-not-marked", enrollments: [{ studentId: "student-1" }], studentAttendanceRecords: [] },
      {
        id: "section-marked",
        enrollments: [{ studentId: "student-2" }],
        studentAttendanceRecords: [{ studentId: "student-2" }]
      }
    ]);

    const result = await getStudentAttendanceDashboardMetrics(ctx, { date: "2026-05-07" });

    expect(mocks.db.studentAttendanceRecord.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["status"],
      where: expect.objectContaining({
        tenantId,
        branchId: { in: [branchId] },
        academicYearId,
        attendanceDate: dashboardDate,
        sessionType: "FULL_DAY"
      })
    }));
    expect(mocks.db.classSection.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId,
      branchId: { in: [branchId] },
      academicYearId,
      status: "ACTIVE"
    });
    expect(result).toEqual({
      date: "2026-05-07",
      marked: 16,
      present: 10,
      absent: 2,
      late: 3,
      halfDay: 1,
      eligibleClassSections: 2,
      classesMarked: 1,
      classesNotMarked: 1,
      markingRate: 50
    });
  });

  it("builds a bounded trend without treating not-marked or non-working records as absence", () => {
    const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 4, index + 1)));
    const result = buildAttendanceTrendPoints(dates, [
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "PRESENT", _count: { _all: 7 } },
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "LATE", _count: { _all: 1 } },
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "ABSENT", _count: { _all: 2 } },
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "NOT_MARKED", _count: { _all: 4 } },
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "HOLIDAY", _count: { _all: 3 } },
      { attendanceDate: new Date(Date.UTC(2026, 4, 7)), status: "WEEK_OFF", _count: { _all: 2 } }
    ]);

    expect(result).toHaveLength(7);
    expect(result[0]).toMatchObject({ date: "2026-05-01", recorded: 0, presenceRate: null });
    expect(result[6]).toMatchObject({
      date: "2026-05-07",
      recorded: 10,
      present: 7,
      absent: 2,
      late: 1,
      presenceRate: 80
    });
  });

  it("scopes student attendance trends to tenant, branch, academic year, and teacher assignments", async () => {
    const teacherCtx = { ...ctx, roleCodes: ["TEACHER"] };

    await getStudentAttendanceDashboardTrend(teacherCtx, { date: "2026-05-07" });

    expect(mocks.db.studentAttendanceRecord.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["attendanceDate", "status"],
      where: expect.objectContaining({
        tenantId,
        branchId: { in: [branchId] },
        academicYearId,
        attendanceDate: {
          gte: new Date(Date.UTC(2026, 4, 1)),
          lte: dashboardDate
        },
        classSection: { classTeacherUserId: userId }
      })
    }));
  });

  it("scopes staff attendance trends to active staff in the current tenant and branch", async () => {
    await getStaffAttendanceDashboardTrend(ctx, { date: "2026-05-07" });

    expect(mocks.db.staffAttendanceRecord.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["attendanceDate", "status"],
      where: expect.objectContaining({
        tenantId,
        branchId: { in: [branchId] },
        attendanceDate: {
          gte: new Date(Date.UTC(2026, 4, 1)),
          lte: dashboardDate
        },
        staff: {
          tenantId,
          branchId: { in: [branchId] },
          employmentStatus: "ACTIVE"
        }
      })
    }));
  });

  it("limits teacher attendance dashboard records to assigned class sections", async () => {
    const teacherCtx = { ...ctx, roleCodes: ["TEACHER"] };

    await getStudentAttendanceDashboardMetrics(teacherCtx, { date: "2026-05-07" });

    expect(mocks.db.studentAttendanceRecord.groupBy.mock.calls[0][0].where.classSection).toEqual({
      classTeacherUserId: userId
    });
    expect(mocks.db.classSection.findMany.mock.calls[0][0].where).toMatchObject({
      classTeacherUserId: userId
    });
  });

  it("staffboard dashboard metrics count active staff and staff types", async () => {
    mocks.db.staffProfile.groupBy.mockResolvedValue([
      { staffType: "TEACHER", _count: { _all: 7 } },
      { staffType: "ADMIN", _count: { _all: 2 } },
      { staffType: "DRIVER", _count: { _all: 3 } }
    ]);

    const result = await getStaffBoardDashboardMetrics(ctx, { date: "2026-05-07" });

    expect(mocks.db.staffProfile.count).not.toHaveBeenCalled();
    expect(mocks.db.staffProfile.groupBy).toHaveBeenCalledWith({
      by: ["staffType"],
      where: {
      tenantId,
      branchId: { in: [branchId] },
      employmentStatus: "ACTIVE"
      },
      _count: { _all: true }
    });
    expect(result).toEqual({
      totalActiveStaff: 12,
      totalTeachers: 7,
      totalNonTeachingStaff: 5,
      activeStaffByType: {
        TEACHER: 7,
        ADMIN: 2,
        DRIVER: 3
      }
    });
  });

  it("staff attendance dashboard metrics count checked-in statuses and not-marked separately from absent", async () => {
    mocks.db.staffProfile.count.mockResolvedValue(10);
    mocks.db.staffAttendanceRecord.count.mockResolvedValueOnce(8).mockResolvedValueOnce(9);
    mocks.db.staffAttendanceRecord.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: { _all: 5 } },
      { status: "LATE", _count: { _all: 2 } },
      { status: "HALF_DAY", _count: { _all: 1 } },
      { status: "ABSENT", _count: { _all: 1 } }
    ]);

    const result = await getStaffAttendanceDashboardMetrics(ctx, { date: "2026-05-07" });

    expect(mocks.db.staffAttendanceRecord.count.mock.calls[0][0].where).toMatchObject({
      tenantId,
      branchId: { in: [branchId] },
      attendanceDate: dashboardDate,
      checkInAt: { not: null }
    });
    expect(result).toEqual({
      date: "2026-05-07",
      checkedIn: 8,
      present: 5,
      late: 2,
      halfDay: 1,
      absent: 1,
      notMarked: 1,
      notMarkedOrAbsent: 2
    });
  });

  it("requires dashboard permission before reading metrics", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.tenant.view"));

    await expect(getCampusCoreDashboardMetrics(ctx, { date: "2026-05-07" })).rejects.toThrow(
      "FORBIDDEN_PERMISSION:campuscore.tenant.view"
    );
    expect(mocks.db.branch.count).not.toHaveBeenCalled();
  });

  it("does not treat staff attendance view permission as dashboard access", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.tenant.view"));

    await expect(getStaffAttendanceDashboardMetrics(ctx, { date: "2026-05-07" })).rejects.toThrow(
      "FORBIDDEN_PERMISSION:campuscore.tenant.view"
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "campuscore.tenant.view",
      branchId
    });
    expect(mocks.db.staffAttendanceRecord.count).not.toHaveBeenCalled();
    expect(mocks.db.staffAttendanceRecord.groupBy).not.toHaveBeenCalled();
  });

  it("rejects branch filters outside the actor branch access list", async () => {
    await expect(
      getAcademiaDashboardMetrics(ctx, { branchId: "00000000-0000-0000-0000-000000000099" })
    ).rejects.toThrow("FORBIDDEN_DASHBOARD_BRANCH");

    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("combines MVP dashboard summary sections", async () => {
    mocks.db.staffProfile.groupBy.mockResolvedValue([
      { staffType: "TEACHER", _count: { _all: 12 } },
      { staffType: "ADMIN", _count: { _all: 8 } }
    ]);
    mocks.db.staffProfile.count.mockResolvedValueOnce(20);
    mocks.db.staffAttendanceRecord.count.mockResolvedValueOnce(15).mockResolvedValueOnce(18);

    const result = await getMvpDashboardSummary(ctx, { date: "2026-05-07" });

    expect(result.campusCore.totalBranches).toBe(1);
    expect(result.academia.totalActiveStudents).toBe(120);
    expect(result.studentAttendanceToday.date).toBe("2026-05-07");
    expect(result.staffBoard.totalActiveStaff).toBe(20);
    expect(result.staffAttendanceToday.checkedIn).toBe(15);
  });

  it("keeps every combined dashboard metric scoped to the current tenant", async () => {
    await getMvpDashboardSummary(ctx, { date: "2026-05-07", branchId: secondBranchId });

    const scopedCalls = [
      ...mocks.db.branch.count.mock.calls,
      ...mocks.db.academicYear.findFirst.mock.calls,
      ...mocks.db.user.count.mock.calls,
      ...mocks.db.role.count.mock.calls,
      ...mocks.db.student.count.mock.calls,
      ...mocks.db.enrollment.count.mock.calls,
      ...mocks.db.class.count.mock.calls,
      ...mocks.db.classSection.count.mock.calls,
      ...mocks.db.classSection.findMany.mock.calls,
      ...mocks.db.guardian.count.mock.calls,
      ...mocks.db.studentAttendanceRecord.groupBy.mock.calls,
      ...mocks.db.staffProfile.count.mock.calls,
      ...mocks.db.staffProfile.groupBy.mock.calls,
      ...mocks.db.staffAttendanceRecord.count.mock.calls,
      ...mocks.db.staffAttendanceRecord.groupBy.mock.calls
    ] as Array<[ { where?: { tenantId?: string; branchId?: unknown } } ]>;

    expect(scopedCalls.length).toBeGreaterThan(0);
    for (const [arg] of scopedCalls) {
      expect(arg.where?.tenantId).toBe(tenantId);
    }
    expect(mocks.db.student.count.mock.calls[0][0].where.branchId).toEqual({ in: [secondBranchId] });
    expect(mocks.db.staffAttendanceRecord.groupBy.mock.calls[0][0].where.branchId).toEqual({ in: [secondBranchId] });
  });
});
