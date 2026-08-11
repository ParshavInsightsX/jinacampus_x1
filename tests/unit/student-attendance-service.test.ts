import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  autoLockStudentAttendanceForDate,
  correctStudentAttendance,
  submitDailyStudentAttendance
} from "@/modules/academia/services/student-attendance.service";
import type { TenantContext } from "@/lib/tenant/context";

type AttendanceWritePayload = {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  classSectionId: string;
  enrollmentId: string;
  studentId: string;
  attendanceDate: Date;
  sessionType: "FULL_DAY";
  status: string;
  remarks?: string;
  markedById: string;
  markedAt: Date;
};

type AttendanceRecord = AttendanceWritePayload & {
  id: string;
  correctionReason: string | null;
  correctedById: string | null;
  correctedAt: Date | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const mocks = vi.hoisted(() => {
  const tx = {
    academicCalendarEntry: { findFirst: vi.fn() },
    attendanceSetting: { findFirst: vi.fn() },
    branch: { findFirst: vi.fn() },
    classSection: { findFirst: vi.fn() },
    enrollment: { findMany: vi.fn() },
    studentAttendanceRecord: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const requirePermission = vi.fn();
  const writeAuditLog = vi.fn();
  return { db, requirePermission, tx, writeAuditLog };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));

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
const enrollmentOneId = "00000000-0000-0000-0000-000000000006";
const enrollmentTwoId = "00000000-0000-0000-0000-000000000007";
const studentOneId = "00000000-0000-0000-0000-000000000008";
const studentTwoId = "00000000-0000-0000-0000-000000000009";
const nonEnrolledStudentId = "00000000-0000-0000-0000-000000000010";
const recordOneId = "00000000-0000-0000-0000-000000000011";
const attendanceDate = new Date(Date.UTC(2026, 3, 3));

function activeClassSection(classTeacherUserId: string | null = ctx.userId) {
  return { id: classSectionId, branchId, academicYearId, classTeacherUserId };
}

function activeEnrollments() {
  return [
    { id: enrollmentOneId, studentId: studentOneId },
    { id: enrollmentTwoId, studentId: studentTwoId }
  ];
}

function createdRecord(data: AttendanceWritePayload, id = `record-${data.studentId}`): AttendanceRecord {
  return {
    id,
    ...data,
    correctionReason: null,
    correctedById: null,
    correctedAt: null,
    lockedAt: null,
    createdAt: new Date("2026-04-03T08:00:00.000Z"),
    updatedAt: new Date("2026-04-03T08:00:00.000Z")
  };
}

function existingRecord(overrides: Partial<ReturnType<typeof createdRecord>> = {}) {
  return {
    ...createdRecord({
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      classSectionId,
      enrollmentId: enrollmentOneId,
      studentId: studentOneId,
      attendanceDate,
      sessionType: "FULL_DAY",
      status: "ABSENT",
      remarks: "Old note",
      markedById: ctx.userId,
      markedAt: new Date("2026-04-03T08:00:00.000Z")
    }, recordOneId),
    ...overrides
  };
}

function resetMocks() {
  mocks.tx.academicCalendarEntry.findFirst.mockReset();
  mocks.tx.classSection.findFirst.mockReset();
  mocks.tx.attendanceSetting.findFirst.mockReset();
  mocks.tx.branch.findFirst.mockReset();
  mocks.tx.enrollment.findMany.mockReset();
  mocks.tx.studentAttendanceRecord.findFirst.mockReset();
  mocks.tx.studentAttendanceRecord.findMany.mockReset();
  mocks.tx.studentAttendanceRecord.create.mockReset();
  mocks.tx.studentAttendanceRecord.update.mockReset();
  mocks.tx.studentAttendanceRecord.updateMany.mockReset();
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
  mocks.tx.academicCalendarEntry.findFirst.mockResolvedValue(null);
  mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId, timezone: "Asia/Kolkata" });
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
    studentAutoLockEnabled: true,
    studentAutoLockTime: "15:00"
  });
  mocks.tx.studentAttendanceRecord.updateMany.mockResolvedValue({ count: 0 });
}

function mockCreateAndUpdateWrites() {
  mocks.tx.studentAttendanceRecord.create.mockImplementation((args: { data: AttendanceWritePayload }) => {
    return Promise.resolve(createdRecord(args.data));
  });
  mocks.tx.studentAttendanceRecord.update.mockImplementation((args: { where: { id: string }; data: AttendanceWritePayload }) => {
    return Promise.resolve(createdRecord(args.data, args.where.id));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-03T08:00:00.000Z"));
  resetMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("submitDailyStudentAttendance", () => {
  it("rejects attendance submission on a configured student holiday", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.academicCalendarEntry.findFirst.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000088",
      name: "Institution holiday",
      entryType: "HOLIDAY",
      startDate: attendanceDate,
      endDate: attendanceDate
    });

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    })).rejects.toMatchObject({ code: "STUDENT_ATTENDANCE_HOLIDAY" });

    expect(mocks.tx.enrollment.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("creates attendance records for active enrolled students", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    const result = await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [
        { studentId: studentOneId, status: "PRESENT" },
        { studentId: studentTwoId, status: "ABSENT", remarks: "Informed by parent" }
      ]
    });

    expect(result).toMatchObject({
      classSectionId,
      attendanceDate: "2026-04-03",
      sessionType: "FULL_DAY",
      totalActiveStudents: 2,
      submittedCount: 2,
      presentCount: 1,
      absentCount: 1,
      createdCount: 2,
      updatedCount: 0
    });
    expect(mocks.tx.studentAttendanceRecord.create).toHaveBeenCalledTimes(2);
  });

  it("maps a database uniqueness conflict to duplicate attendance prevention", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mocks.tx.studentAttendanceRecord.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the student attendance record key",
      {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["tenantId", "academicYearId", "studentId", "attendanceDate", "sessionType"] }
      }
    ));

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    })).rejects.toMatchObject({ code: "STUDENT_ATTENDANCE_ALREADY_EXISTS" });

    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("uses tenant, branch, academic year, and actor IDs from context", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    });

    expect(mocks.tx.studentAttendanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        classSectionId,
        enrollmentId: enrollmentOneId,
        studentId: studentOneId,
        attendanceDate,
        sessionType: "FULL_DAY",
        markedById: ctx.userId
      })
    });
  });

  it("rejects non-enrolled student IDs", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue([{ id: enrollmentOneId, studentId: studentOneId }]);

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: nonEnrolledStudentId, status: "PRESENT" }]
    })).rejects.toMatchObject({ code: "STUDENT_NOT_ACTIVE_ENROLLED" });

    expect(mocks.tx.studentAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate student IDs in the payload", async () => {
    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [
        { studentId: studentOneId, status: "PRESENT" },
        { studentId: studentOneId, status: "ABSENT" }
      ]
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects NOT_MARKED as a submitted status", async () => {
    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "NOT_MARKED" }]
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects normal submission when an existing record is locked", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([
      existingRecord({ lockedAt: new Date("2026-04-03T10:30:00.000Z") })
    ]);

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    })).rejects.toMatchObject({ code: "STUDENT_ATTENDANCE_LOCKED" });

    expect(mocks.tx.studentAttendanceRecord.update).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("updates existing unlocked attendance records", async () => {
    const before = existingRecord();
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([before]);
    mockCreateAndUpdateWrites();

    const result = await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "EXCUSED", remarks: "Medical note" }]
    });

    expect(result.updatedCount).toBe(1);
    expect(result.createdCount).toBe(0);
    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: recordOneId },
      data: expect.objectContaining({
        status: "EXCUSED",
        remarks: "Medical note",
        markedById: ctx.userId
      })
    });
  });

  it("writes audit logs for created attendance records", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_SUBMITTED,
      entityType: "StudentAttendanceRecord",
      branchId,
      academicYearId,
      after: expect.objectContaining({ studentId: studentOneId, status: "PRESENT" }),
      metadata: expect.objectContaining({
        classSectionId,
        studentId: studentOneId,
        attendanceDate: "2026-04-03",
        sessionType: "FULL_DAY",
        newStatus: "PRESENT"
      })
    }), mocks.tx);
  });

  it("writes before and after audit logs for updated attendance records", async () => {
    const before = existingRecord();
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([before]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "LATE", remarks: "Transport delay" }]
    });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_UPDATED,
      entityType: "StudentAttendanceRecord",
      entityId: recordOneId,
      before,
      after: expect.objectContaining({ studentId: studentOneId, status: "LATE" }),
      metadata: expect.objectContaining({
        oldStatus: "ABSENT",
        newStatus: "LATE",
        remarksChanged: true
      })
    }), mocks.tx);
  });

  it("requires attendance mark permission for the resolved class-section scope", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "academia.attendance.mark",
      branchId,
      academicYearId
    });
  });

  it("requires broader attendance permission when marking a class-section assigned to another teacher", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection("00000000-0000-0000-0000-000000000099"));
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "academia.attendance.update",
      branchId,
      academicYearId
    });
  });

  it("does not write when permission is denied", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:academia.attendance.mark"));

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    })).rejects.toThrow("FORBIDDEN_PERMISSION:academia.attendance.mark");

    expect(mocks.tx.enrollment.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("uses tenant, branch, academic-year, active enrollment, and active student scoped queries", async () => {
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.enrollment.findMany.mockResolvedValue(activeEnrollments());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);
    mockCreateAndUpdateWrites();

    await submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    });

    expect(mocks.tx.classSection.findFirst).toHaveBeenCalledWith({
      where: {
        id: classSectionId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        status: "ACTIVE"
      },
      select: { id: true, branchId: true, academicYearId: true, classTeacherUserId: true }
    });
    expect(mocks.tx.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        classSectionId,
        status: "ACTIVE",
        enrolledOn: { lte: attendanceDate },
        OR: [{ leftOn: null }, { leftOn: { gte: attendanceDate } }],
        student: {
          tenantId: ctx.tenantId,
          branchId,
          status: "ACTIVE"
        }
      })
    }));
    expect(mocks.tx.studentAttendanceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId: ctx.tenantId,
        academicYearId,
        attendanceDate,
        sessionType: "FULL_DAY",
        studentId: { in: [studentOneId] }
      }
    }));
  });
});

describe("autoLockStudentAttendanceForDate", () => {
  it("locks unlocked records after cutoff", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([
      { id: recordOneId, lockedAt: null },
      { id: "00000000-0000-0000-0000-000000000012", lockedAt: null }
    ]);
    mocks.tx.studentAttendanceRecord.updateMany.mockResolvedValue({ count: 2 });

    const result = await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(result).toMatchObject({
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      attendanceDate: "2026-04-03",
      sessionType: "FULL_DAY",
      autoLockEnabled: true,
      cutoffTime: "15:00",
      timeZone: "Asia/Kolkata",
      cutoffPassed: true,
      lockedCount: 2,
      alreadyLockedCount: 0,
      skippedCount: 0
    });
    expect(mocks.tx.studentAttendanceRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [recordOneId, "00000000-0000-0000-0000-000000000012"] },
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        attendanceDate,
        sessionType: "FULL_DAY",
        lockedAt: null
      },
      data: { lockedAt: expect.any(Date) }
    });
  });

  it("does not lock when auto-lock is disabled", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
      studentAutoLockEnabled: false,
      studentAutoLockTime: "15:00"
    });

    const result = await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(result.autoLockEnabled).toBe(false);
    expect(result.lockedCount).toBe(0);
    expect(mocks.tx.studentAttendanceRecord.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.updateMany).not.toHaveBeenCalled();
  });

  it("uses the default cutoff when attendance settings are missing", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.attendanceSetting.findFirst.mockResolvedValue(null);
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);

    const result = await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(result.autoLockEnabled).toBe(true);
    expect(result.cutoffTime).toBe("15:00");
    expect(result.cutoffPassed).toBe(true);
  });

  it("does not relock already locked records", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([
      { id: recordOneId, lockedAt: new Date("2026-04-03T09:40:00.000Z") }
    ]);

    const result = await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(result.lockedCount).toBe(0);
    expect(result.alreadyLockedCount).toBe(1);
    expect(mocks.tx.studentAttendanceRecord.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("scopes locking by tenant, branch, academic year, attendance date, and session", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);

    await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(mocks.tx.studentAttendanceRecord.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        attendanceDate,
        sessionType: "FULL_DAY"
      },
      select: { id: true, lockedAt: true }
    });
  });

  it("writes a batch audit log for locking", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([{ id: recordOneId, lockedAt: null }]);
    mocks.tx.studentAttendanceRecord.updateMany.mockResolvedValue({ count: 1 });

    await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_LOCKED,
      entityType: "StudentAttendanceRecordBatch",
      entityId: null,
      branchId,
      academicYearId,
      metadata: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        attendanceDate: "2026-04-03",
        sessionType: "FULL_DAY",
        lockedRecordIds: [recordOneId],
        lockedCount: 1,
        cutoffTime: "15:00",
        timeZone: "Asia/Kolkata"
      })
    }), mocks.tx);
  });

  it("returns a safe summary when no records exist", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([]);

    const result = await autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    });

    expect(result.lockedCount).toBe(0);
    expect(result.alreadyLockedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("requires lock permission for manual locking", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:academia.attendance.lock"));

    await expect(autoLockStudentAttendanceForDate(ctx, {
      attendanceDate: "2026-04-03"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:academia.attendance.lock");

    expect(mocks.tx.studentAttendanceRecord.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.updateMany).not.toHaveBeenCalled();
  });

  it("rejects normal submission after cutoff and locks existing records", async () => {
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
    mocks.tx.classSection.findFirst.mockResolvedValue(activeClassSection());
    mocks.tx.studentAttendanceRecord.findMany.mockResolvedValue([{ id: recordOneId, lockedAt: null }]);
    mocks.tx.studentAttendanceRecord.updateMany.mockResolvedValue({ count: 1 });

    await expect(submitDailyStudentAttendance(ctx, {
      classSectionId,
      attendanceDate: "2026-04-03",
      entries: [{ studentId: studentOneId, status: "PRESENT" }]
    })).rejects.toMatchObject({ code: "STUDENT_ATTENDANCE_CUTOFF_PASSED" });

    expect(mocks.tx.studentAttendanceRecord.updateMany).toHaveBeenCalled();
    expect(mocks.tx.enrollment.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.create).not.toHaveBeenCalled();
  });
});

describe("correctStudentAttendance", () => {
  it("updates status and correction reason for an authorized correction user", async () => {
    const before = existingRecord({ status: "ABSENT", remarks: "Old note" });
    const after = {
      ...before,
      status: "EXCUSED",
      remarks: "Doctor note verified",
      correctionReason: "Verified medical certificate",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    const result = await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "EXCUSED",
      correctionReason: "Verified medical certificate",
      remarks: "Doctor note verified"
    });

    expect(result).toMatchObject({
      attendanceRecordId: recordOneId,
      studentId: studentOneId,
      classSectionId,
      attendanceDate: "2026-04-03",
      sessionType: "FULL_DAY",
      previousStatus: "ABSENT",
      newStatus: "EXCUSED",
      correctionReason: "Verified medical certificate",
      correctedById: ctx.userId
    });
    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: recordOneId },
      data: {
        status: "EXCUSED",
        remarks: "Doctor note verified",
        correctionReason: "Verified medical certificate",
        correctedById: ctx.userId,
        correctedAt: expect.any(Date)
      }
    });
  });

  it("uses tenant, branch, academic year, and actor context", async () => {
    const before = existingRecord();
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue({
      ...before,
      status: "PRESENT",
      correctionReason: "Attendance register reviewed",
      correctedById: ctx.userId,
      correctedAt: new Date()
    });

    await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Attendance register reviewed"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "academia.attendance.correct",
      branchId,
      academicYearId
    });
    expect(mocks.tx.studentAttendanceRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: recordOneId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        sessionType: "FULL_DAY"
      }
    });
    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ correctedById: ctx.userId })
    }));
  });

  it("allows authorized correction of locked records and preserves lockedAt", async () => {
    const lockedAt = new Date("2026-04-03T10:00:00.000Z");
    const before = existingRecord({ lockedAt });
    const after = {
      ...before,
      status: "PRESENT",
      correctionReason: "Principal approved correction",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    const result = await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Principal approved correction"
    });

    expect(result.lockedAt).toBe(lockedAt.toISOString());
    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ lockedAt: expect.anything() })
    }));
  });

  it("preserves markedById and markedAt during correction", async () => {
    const markedAt = new Date("2026-04-03T08:15:00.000Z");
    const before = existingRecord({ markedById: "00000000-0000-0000-0000-000000000099", markedAt });
    const after = {
      ...before,
      status: "LATE",
      correctionReason: "Late entry verified",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "LATE",
      correctionReason: "Late entry verified"
    });

    const updateData = mocks.tx.studentAttendanceRecord.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("markedById");
    expect(updateData).not.toHaveProperty("markedAt");
  });

  it("rejects NOT_MARKED as a correction status", async () => {
    await expect(correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "NOT_MARKED",
      correctionReason: "Invalid status check"
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("rejects blank or short correction reasons", async () => {
    await expect(correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "   "
    })).rejects.toThrow();

    await expect(correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Fix"
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("rejects correction when permission is missing", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:academia.attendance.correct"));

    await expect(correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Register verified"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:academia.attendance.correct");

    expect(mocks.tx.studentAttendanceRecord.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.studentAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("returns safe not found for cross-tenant or inaccessible records", async () => {
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(null);

    await expect(correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Record checked"
    })).rejects.toMatchObject({ code: "STUDENT_ATTENDANCE_RECORD_NOT_FOUND" });

    expect(mocks.tx.studentAttendanceRecord.findFirst).toHaveBeenCalledWith({
      where: {
        id: recordOneId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        sessionType: "FULL_DAY"
      }
    });
    expect(mocks.tx.studentAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("creates an audit log with before and after values", async () => {
    const before = existingRecord({ status: "ABSENT", remarks: "Old note" });
    const after = {
      ...before,
      status: "EXCUSED",
      remarks: "Doctor note verified",
      correctionReason: "Medical certificate checked",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "EXCUSED",
      correctionReason: "Medical certificate checked",
      remarks: "Doctor note verified"
    });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ATTENDANCE_CORRECTED,
      entityType: "StudentAttendanceRecord",
      entityId: recordOneId,
      branchId,
      academicYearId,
      before,
      after,
      metadata: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        attendanceRecordId: recordOneId,
        studentId: studentOneId,
        classSectionId,
        attendanceDate: "2026-04-03",
        sessionType: "FULL_DAY",
        previousStatus: "ABSENT",
        newStatus: "EXCUSED",
        previousRemarks: "Old note",
        newRemarks: "Doctor note verified",
        correctionReason: "Medical certificate checked",
        correctedById: ctx.userId
      })
    }), mocks.tx);
  });

  it("updates remarks when provided", async () => {
    const before = existingRecord({ remarks: "Old note" });
    const after = {
      ...before,
      status: "PRESENT",
      remarks: "Corrected after register review",
      correctionReason: "Register review completed",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Register review completed",
      remarks: "Corrected after register review"
    });

    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ remarks: "Corrected after register review" })
    }));
  });

  it("preserves remarks when correction remarks are not provided", async () => {
    const before = existingRecord({ remarks: "Existing note" });
    const after = {
      ...before,
      status: "PRESENT",
      correctionReason: "Register review completed",
      correctedById: ctx.userId,
      correctedAt: new Date()
    };
    mocks.tx.studentAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.studentAttendanceRecord.update.mockResolvedValue(after);

    await correctStudentAttendance(ctx, {
      attendanceRecordId: recordOneId,
      status: "PRESENT",
      correctionReason: "Register review completed"
    });

    expect(mocks.tx.studentAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ remarks: "Existing note" })
    }));
  });
});
