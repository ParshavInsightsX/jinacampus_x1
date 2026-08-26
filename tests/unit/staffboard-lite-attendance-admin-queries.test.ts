import { beforeEach, describe, expect, it, vi } from "vitest";
import { listStaffAttendanceForDate } from "@/modules/staffboard-lite/queries/staff-attendance.queries";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const db = {
    branch: { findMany: vi.fn() },
    staffProfile: { findMany: vi.fn() }
  };
  const requirePermission = vi.fn();
  return { db, requirePermission };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const otherBranchId = "00000000-0000-0000-0000-000000000004";

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000005"
};

function branch(overrides: Record<string, unknown> = {}) {
  return {
    id: branchId,
    name: "Main Branch",
    code: "MAIN",
    ...overrides
  };
}

function staffProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000101",
    employeeCode: "EMP-1001",
    firstName: "Meera",
    middleName: null,
    lastName: "Sharma",
    staffType: "TEACHER",
    department: "Academics",
    branch: { name: "Main Branch" },
    staffAttendanceRecords: [],
    ...overrides
  };
}

function attendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000201",
    status: "PRESENT",
    checkInAt: new Date("2026-05-05T03:45:00.000Z"),
    checkOutAt: new Date("2026-05-05T11:45:00.000Z"),
    workingMinutes: 480,
    checkInSource: "QR_SCAN",
    checkOutSource: "QR_SCAN",
    correctionReason: null,
    ...overrides
  };
}

beforeEach(() => {
  mocks.db.branch.findMany.mockReset();
  mocks.db.staffProfile.findMany.mockReset();
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.db.branch.findMany.mockResolvedValue([branch()]);
  mocks.db.staffProfile.findMany.mockResolvedValue([]);
});

describe("StaffBoard Lite staff attendance admin queries", () => {
  it("lists daily staff attendance with tenant, branch, and date scoping", async () => {
    mocks.db.staffProfile.findMany.mockResolvedValue([
      staffProfile({
        staffAttendanceRecords: [attendanceRecord()]
      })
    ]);

    const result = await listStaffAttendanceForDate(ctx, { date: "2026-05-05" });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      attendanceRecordId: "00000000-0000-0000-0000-000000000201",
      staffId: "00000000-0000-0000-0000-000000000101",
      employeeCode: "EMP-1001",
      status: "PRESENT",
      source: "QR_SCAN"
    });
    expect(mocks.db.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        id: { in: [branchId] },
        status: { not: "ARCHIVED" }
      })
    }));
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.view",
      branchId
    });

    const staffQuery = mocks.db.staffProfile.findMany.mock.calls[0][0];
    expect(staffQuery.where).toMatchObject({
      tenantId,
      branchId,
      employmentStatus: "ACTIVE"
    });
    expect(staffQuery.select.staffAttendanceRecords.where).toMatchObject({
      tenantId,
      branchId
    });
    expect(staffQuery.select.staffAttendanceRecords.where.attendanceDate.toISOString()).toBe(
      "2026-05-05T00:00:00.000Z"
    );
  });

  it("filters staff rows by staffType, status, and search without accepting unsafe context fields", async () => {
    mocks.db.staffProfile.findMany.mockResolvedValue([
      staffProfile({
        id: "00000000-0000-0000-0000-000000000102",
        employeeCode: "EMP-1002",
        firstName: "Ravi",
        staffType: "DRIVER",
        staffAttendanceRecords: [attendanceRecord({ status: "LATE" })]
      }),
      staffProfile({
        id: "00000000-0000-0000-0000-000000000103",
        employeeCode: "EMP-1003",
        firstName: "Asha",
        staffType: "DRIVER",
        staffAttendanceRecords: [attendanceRecord({ id: "00000000-0000-0000-0000-000000000202", status: "PRESENT" })]
      })
    ]);

    const result = await listStaffAttendanceForDate(ctx, {
      date: "2026-05-05",
      staffType: "DRIVER",
      status: "LATE",
      search: "driver"
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ employeeCode: "EMP-1002", status: "LATE" });
    const staffQuery = mocks.db.staffProfile.findMany.mock.calls[0][0];
    expect(staffQuery.where).toMatchObject({
      tenantId,
      branchId,
      staffType: "DRIVER"
    });
    expect(staffQuery.where.OR).toEqual(expect.arrayContaining([
      { employeeCode: { contains: "driver", mode: "insensitive" } },
      { firstName: { contains: "driver", mode: "insensitive" } }
    ]));
    expect(JSON.stringify(staffQuery)).not.toContain("actorUserId");
  });

  it("computes daily summary counts including not-marked staff", async () => {
    mocks.db.staffProfile.findMany.mockResolvedValue([
      staffProfile({ id: "00000000-0000-0000-0000-000000000111", staffAttendanceRecords: [attendanceRecord()] }),
      staffProfile({ id: "00000000-0000-0000-0000-000000000112", staffAttendanceRecords: [attendanceRecord({ status: "LATE" })] }),
      staffProfile({ id: "00000000-0000-0000-0000-000000000113", staffAttendanceRecords: [attendanceRecord({ status: "HALF_DAY" })] }),
      staffProfile({ id: "00000000-0000-0000-0000-000000000114", staffAttendanceRecords: [attendanceRecord({ status: "ABSENT", checkInAt: null, checkOutAt: null, workingMinutes: null })] }),
      staffProfile({ id: "00000000-0000-0000-0000-000000000115", staffAttendanceRecords: [attendanceRecord({ status: "ON_LEAVE", checkInAt: null, checkOutAt: null, workingMinutes: null })] }),
      staffProfile({ id: "00000000-0000-0000-0000-000000000116", staffAttendanceRecords: [] })
    ]);

    const result = await listStaffAttendanceForDate(ctx, { date: "2026-05-05" });

    expect(result.summary).toEqual({
      totalStaff: 6,
      checkedIn: 3,
      present: 1,
      late: 1,
      halfDay: 1,
      absentNotMarked: 2,
      onLeaveHoliday: 1,
      officialDuty: 0,
      pendingReview: 0
    });
  });

  it("rejects inaccessible requested branches without querying staff records", async () => {
    await expect(listStaffAttendanceForDate(ctx, {
      branchId: otherBranchId,
      date: "2026-05-05"
    })).rejects.toMatchObject({ code: "FORBIDDEN_STAFF_ATTENDANCE_BRANCH" });

    expect(mocks.db.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it("does not select raw QR token or tokenHash fields", async () => {
    await listStaffAttendanceForDate(ctx, { date: "2026-05-05" });

    const staffQuery = mocks.db.staffProfile.findMany.mock.calls[0][0];
    expect(JSON.stringify(staffQuery.select)).not.toMatch(/tokenHash|rawToken|token/i);
  });
});
