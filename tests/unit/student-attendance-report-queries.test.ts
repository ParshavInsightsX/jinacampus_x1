import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import {
  getDailyStudentAttendanceSummary,
  getMonthlyAttendancePercentageByClassSection,
  getStudentAttendanceHistory,
  listAbsentStudentsForDate,
  listClassSectionsAttendanceStatusForDate,
  listLateStudentsForDate
} from "@/modules/academia/queries/student-attendance-reports.queries";

const mocks = vi.hoisted(() => {
  const db = {
    academicCalendarEntry: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn(), findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    studentAttendanceRecord: { findMany: vi.fn() }
  };
  const getEffectivePermissions = vi.fn();
  const requirePermission = vi.fn();
  return { db, getEffectivePermissions, requirePermission };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions,
  requirePermission: mocks.requirePermission
}));

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: "00000000-0000-0000-0000-000000000003",
  accessibleBranchIds: ["00000000-0000-0000-0000-000000000003"],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
};

const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const classSectionId = "00000000-0000-0000-0000-000000000005";
const studentOneId = "00000000-0000-0000-0000-000000000006";
const studentTwoId = "00000000-0000-0000-0000-000000000007";
const attendanceDate = new Date(Date.UTC(2026, 3, 3));

function attendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    classSectionId,
    attendanceDate,
    status: "PRESENT",
    remarks: null,
    lockedAt: null,
    classSection: { id: classSectionId, displayName: "Class 1 A" },
    student: {
      admissionNumber: "ADM-1001",
      firstName: "Aarav",
      middleName: null,
      lastName: "Shah",
      displayName: null
    },
    ...overrides
  };
}

beforeEach(() => {
  mocks.db.academicCalendarEntry.findFirst.mockReset();
  mocks.db.academicCalendarEntry.findFirst.mockResolvedValue(null);
  mocks.db.classSection.findFirst.mockReset();
  mocks.db.classSection.findMany.mockReset();
  mocks.db.enrollment.findMany.mockReset();
  mocks.db.studentAttendanceRecord.findMany.mockReset();
  mocks.getEffectivePermissions.mockReset();
  mocks.getEffectivePermissions.mockResolvedValue(new Set([
    "academia.attendance.report",
    "academia.attendance.update"
  ]));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
});

describe("student attendance report queries", () => {
  it("builds a tenant, branch, and academic-year scoped daily summary", async () => {
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([
      attendanceRecord({ status: "PRESENT" }),
      attendanceRecord({
        id: "00000000-0000-0000-0000-000000000011",
        status: "ABSENT",
        lockedAt: new Date("2026-04-03T10:00:00.000Z")
      })
    ]);

    const result = await getDailyStudentAttendanceSummary(ctx, {
      attendanceDate: "2026-04-03",
      classSectionId
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "academia.attendance.report",
      branchId,
      academicYearId
    });
    expect(mocks.db.studentAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        classSectionId,
        attendanceDate,
        sessionType: "FULL_DAY"
      })
    }));
    expect(result).toEqual([expect.objectContaining({
      classSectionId,
      classSectionName: "Class 1 A",
      totalMarked: 2,
      presentCount: 1,
      absentCount: 1,
      lockedCount: 1,
      isLocked: true
    })]);
  });

  it("returns only absent records for the absent list by default", async () => {
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([
      attendanceRecord({ status: "ABSENT", remarks: "Informed by parent" })
    ]);

    const result = await listAbsentStudentsForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(mocks.db.studentAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "ABSENT", attendanceDate })
    }));
    expect(result[0]).toMatchObject({
      admissionNo: "ADM-1001",
      studentName: "Aarav Shah",
      classSectionName: "Class 1 A",
      status: "ABSENT",
      remarks: "Informed by parent"
    });
  });

  it("returns only late records for the late list", async () => {
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([
      attendanceRecord({ status: "LATE", remarks: "Bus delay" })
    ]);

    await listLateStudentsForDate(ctx, {
      attendanceDate: "2026-04-03",
      classSectionId
    });

    expect(mocks.db.studentAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "LATE", classSectionId, attendanceDate })
    }));
  });

  it("filters student history by student and date range", async () => {
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([
      attendanceRecord({ studentId: studentOneId, status: "HALF_DAY" })
    ]);

    await getStudentAttendanceHistory(ctx, {
      studentId: studentOneId,
      fromDate: "2026-04-01",
      toDate: "2026-04-30"
    });

    expect(mocks.db.studentAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        studentId: studentOneId,
        attendanceDate: {
          gte: new Date(Date.UTC(2026, 3, 1)),
          lte: new Date(Date.UTC(2026, 3, 30))
        }
      })
    }));
  });

  it("computes pending counts for classes not marked", async () => {
    mocks.db.classSection.findMany.mockResolvedValue([
      {
        id: classSectionId,
        displayName: "Class 1 A",
        classTeacherUser: null,
        enrollments: [{ studentId: studentOneId }, { studentId: studentTwoId }],
        studentAttendanceRecords: [{ studentId: studentOneId }]
      }
    ]);

    const result = await listClassSectionsAttendanceStatusForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    const classSectionQuery = mocks.db.classSection.findMany.mock.calls[0][0];
    expect(classSectionQuery.where).toMatchObject({
      tenantId: ctx.tenantId,
      branchId,
      academicYearId
    });
    expect(classSectionQuery.include.enrollments.where).toMatchObject({
      tenantId: ctx.tenantId,
      branchId,
      academicYearId
    });
    expect(classSectionQuery.include.enrollments.where.student).toMatchObject({
      tenantId: ctx.tenantId,
      branchId
    });
    expect(classSectionQuery.include.studentAttendanceRecords.where).toMatchObject({
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      attendanceDate,
      sessionType: "FULL_DAY"
    });
    expect(result).toEqual([{
      classSectionId,
      classSectionName: "Class 1 A",
      classTeacherName: null,
      activeEnrollmentCount: 2,
      markedCount: 1,
      pendingCount: 1,
      status: "PARTIALLY_MARKED"
    }]);
  });

  it("calculates monthly percentage from present, absent, late, and half-day statuses", async () => {
    mocks.db.classSection.findFirst.mockResolvedValue({ id: classSectionId });
    mocks.db.enrollment.findMany.mockResolvedValue([
      {
        studentId: studentOneId,
        rollNumber: "7",
        student: {
          admissionNumber: "ADM-1001",
          firstName: "Aarav",
          middleName: null,
          lastName: "Shah",
          displayName: null
        }
      }
    ]);
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([
      { studentId: studentOneId, status: "PRESENT" },
      { studentId: studentOneId, status: "LATE" },
      { studentId: studentOneId, status: "HALF_DAY" },
      { studentId: studentOneId, status: "ABSENT" }
    ]);

    const result = await getMonthlyAttendancePercentageByClassSection(ctx, {
      classSectionId,
      month: 4,
      year: 2026
    });

    expect(result).toEqual([{
      studentId: studentOneId,
      rollNumber: "7",
      admissionNo: "ADM-1001",
      studentName: "Aarav Shah",
      presentEquivalentDays: 2.5,
      markedDays: 4,
      absentDays: 1,
      lateDays: 1,
      halfDayDays: 1,
      attendancePercentage: 62.5
    }]);
  });

  it("does not treat missing monthly attendance records as absent days", async () => {
    mocks.db.classSection.findFirst.mockResolvedValue({ id: classSectionId });
    mocks.db.enrollment.findMany.mockResolvedValue([
      {
        studentId: studentOneId,
        rollNumber: "7",
        student: {
          admissionNumber: "ADM-1001",
          firstName: "Aarav",
          middleName: null,
          lastName: "Shah",
          displayName: null
        }
      }
    ]);
    mocks.db.studentAttendanceRecord.findMany.mockResolvedValue([]);

    const result = await getMonthlyAttendancePercentageByClassSection(ctx, {
      classSectionId,
      month: 4,
      year: 2026
    });

    expect(result).toEqual([expect.objectContaining({
      studentId: studentOneId,
      markedDays: 0,
      absentDays: 0,
      lateDays: 0,
      halfDayDays: 0,
      attendancePercentage: 0
    })]);
  });

  it("requires attendance report permission before reading report data", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:academia.attendance.report"));

    await expect(listAbsentStudentsForDate(ctx, {
      attendanceDate: "2026-04-03"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:academia.attendance.report");

    expect(mocks.db.studentAttendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
