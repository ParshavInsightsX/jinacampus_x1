import type { Prisma, StudentAttendanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import {
  absentStudentsReportFilterSchema,
  classSectionsNotMarkedReportFilterSchema,
  dailyAttendanceReportFilterSchema,
  lateStudentsReportFilterSchema,
  monthlyAttendancePercentageFilterSchema,
  studentAttendanceHistoryFilterSchema
} from "@/modules/academia/schemas";
import type { AttendanceClassSectionOption } from "./student-attendance.queries";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";

type AttendanceReportScope = {
  branchId: string;
  academicYearId: string;
  classSectionFilter: Prisma.ClassSectionWhereInput;
};

export type DailyStudentAttendanceSummaryRow = {
  classSectionId: string;
  classSectionName: string;
  totalMarked: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  halfDayCount: number;
  onLeaveCount: number;
  excusedCount: number;
  lockedCount: number;
  isLocked: boolean;
};

export type StudentAttendanceListRow = {
  attendanceRecordId: string;
  admissionNo: string;
  studentName: string;
  classSectionId: string;
  classSectionName: string;
  status: string;
  remarks: string | null;
};

export type StudentAttendanceHistoryRow = StudentAttendanceListRow & {
  attendanceDate: string;
  lockedAt: string | null;
};

export type ClassSectionAttendanceStatusRow = {
  classSectionId: string;
  classSectionName: string;
  classTeacherName: string | null;
  activeEnrollmentCount: number;
  markedCount: number;
  pendingCount: number;
  status: "NOT_MARKED" | "PARTIALLY_MARKED" | "MARKED";
};

export type MonthlyAttendancePercentageRow = {
  studentId: string;
  rollNumber: string | null;
  admissionNo: string;
  studentName: string;
  presentEquivalentDays: number;
  markedDays: number;
  absentDays: number;
  lateDays: number;
  halfDayDays: number;
  attendancePercentage: number;
};

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayName(person: { displayName: string | null; firstName: string; middleName?: string | null; lastName: string | null }) {
  return person.displayName ?? [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}

function teacherDisplayName(user: { displayName: string | null; firstName: string | null; lastName: string | null; email: string }) {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

function incrementSummary(summary: DailyStudentAttendanceSummaryRow, status: StudentAttendanceStatus) {
  switch (status) {
    case "PRESENT":
      summary.presentCount += 1;
      break;
    case "ABSENT":
      summary.absentCount += 1;
      break;
    case "LATE":
      summary.lateCount += 1;
      break;
    case "HALF_DAY":
      summary.halfDayCount += 1;
      break;
    case "ON_LEAVE":
      summary.onLeaveCount += 1;
      break;
    case "EXCUSED":
      summary.excusedCount += 1;
      break;
    case "NOT_MARKED":
      break;
  }
}

function presentEquivalent(status: StudentAttendanceStatus) {
  if (status === "PRESENT" || status === "LATE" || status === "EXCUSED") return 1;
  if (status === "HALF_DAY") return 0.5;
  return 0;
}

function roundPercentage(value: number) {
  return Math.round(value * 100) / 100;
}

function monthRange(year: number, month: number) {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    endDate: new Date(Date.UTC(year, month, 0))
  };
}

async function resolveReportScope(ctx: TenantContext): Promise<AttendanceReportScope | null> {
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  if (!branchId || !academicYearId) return null;

  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "READ" }
  ], { branchId });

  await requirePermission({
    ctx,
    permission: "academia.attendance.report",
    branchId,
    academicYearId
  });

  const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
  const canViewBranchReports =
    permissions.has("academia.attendance.update") ||
    permissions.has("academia.attendance.correct") ||
    permissions.has("academia.attendance.lock");

  return {
    branchId,
    academicYearId,
    classSectionFilter: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      status: "ACTIVE",
      ...(canViewBranchReports ? {} : { classTeacherUserId: ctx.userId })
    }
  };
}

export async function listClassSectionsForAttendanceReports(ctx: TenantContext): Promise<AttendanceClassSectionOption[]> {
  const scope = await resolveReportScope(ctx);
  if (!scope) return [];

  const classSections = await db.classSection.findMany({
    where: scope.classSectionFilter,
    include: {
      academicClass: { select: { name: true, sortOrder: true } },
      section: { select: { name: true, sortOrder: true } },
      branch: { select: { name: true } },
      academicYear: { select: { name: true } },
      classTeacherUser: { select: { displayName: true, firstName: true, lastName: true, email: true } }
    },
    orderBy: [{ academicClass: { sortOrder: "asc" } }, { section: { sortOrder: "asc" } }]
  });

  return classSections.map((classSection) => ({
    id: classSection.id,
    displayName: classSection.displayName,
    className: classSection.academicClass.name,
    sectionName: classSection.section.name,
    branchName: classSection.branch.name,
    academicYearName: classSection.academicYear.name,
    classTeacherName: classSection.classTeacherUser ? teacherDisplayName(classSection.classTeacherUser) : null
  }));
}

export async function getDailyStudentAttendanceSummary(ctx: TenantContext, input: unknown = {}) {
  const params = dailyAttendanceReportFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx);
  if (!scope) return [];

  const attendanceDate = normalizeDateOnly(params.attendanceDate);
  const records = await db.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      attendanceDate,
      sessionType: "FULL_DAY",
      classSectionId: params.classSectionId,
      status: params.status,
      classSection: scope.classSectionFilter
    },
    include: {
      classSection: { select: { id: true, displayName: true } }
    },
    orderBy: [{ classSection: { displayName: "asc" } }]
  });

  const summaryByClassSection = new Map<string, DailyStudentAttendanceSummaryRow>();
  for (const record of records) {
    const summary = summaryByClassSection.get(record.classSectionId) ?? {
      classSectionId: record.classSectionId,
      classSectionName: record.classSection.displayName,
      totalMarked: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      halfDayCount: 0,
      onLeaveCount: 0,
      excusedCount: 0,
      lockedCount: 0,
      isLocked: false
    };
    summary.totalMarked += 1;
    summary.lockedCount += record.lockedAt ? 1 : 0;
    incrementSummary(summary, record.status);
    summary.isLocked = summary.lockedCount > 0;
    summaryByClassSection.set(record.classSectionId, summary);
  }

  return Array.from(summaryByClassSection.values());
}

export async function listAbsentStudentsForDate(ctx: TenantContext, input: unknown = {}) {
  const params = absentStudentsReportFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx);
  if (!scope) return [];

  const attendanceDate = normalizeDateOnly(params.attendanceDate);
  const records = await db.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      attendanceDate,
      sessionType: "FULL_DAY",
      classSectionId: params.classSectionId,
      status: params.status,
      classSection: scope.classSectionFilter
    },
    include: {
      classSection: { select: { id: true, displayName: true } },
      student: {
        select: {
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true
        }
      }
    },
    orderBy: [
      { classSection: { displayName: "asc" } },
      { student: { displayName: "asc" } },
      { student: { admissionNumber: "asc" } }
    ]
  });

  return records.map((record): StudentAttendanceListRow => ({
    attendanceRecordId: record.id,
    admissionNo: record.student.admissionNumber,
    studentName: displayName(record.student),
    classSectionId: record.classSectionId,
    classSectionName: record.classSection.displayName,
    status: record.status,
    remarks: record.remarks
  }));
}

export async function listLateStudentsForDate(ctx: TenantContext, input: unknown = {}) {
  const params = lateStudentsReportFilterSchema.parse(input);
  return listAbsentStudentsForDate(ctx, {
    attendanceDate: params.attendanceDate,
    classSectionId: params.classSectionId,
    status: "LATE"
  });
}

export async function getStudentAttendanceHistory(ctx: TenantContext, input: unknown = {}) {
  const params = studentAttendanceHistoryFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx);
  if (!scope || !params.studentId) return [];

  const fromDate = normalizeDateOnly(params.fromDate);
  const toDate = normalizeDateOnly(params.toDate);
  const records = await db.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      studentId: params.studentId,
      attendanceDate: { gte: fromDate, lte: toDate },
      sessionType: "FULL_DAY",
      classSection: scope.classSectionFilter
    },
    include: {
      classSection: { select: { id: true, displayName: true } },
      student: {
        select: {
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true
        }
      }
    },
    orderBy: [{ attendanceDate: "desc" }]
  });

  return records.map((record): StudentAttendanceHistoryRow => ({
    attendanceRecordId: record.id,
    attendanceDate: toDateOnlyString(record.attendanceDate),
    admissionNo: record.student.admissionNumber,
    studentName: displayName(record.student),
    classSectionId: record.classSectionId,
    classSectionName: record.classSection.displayName,
    status: record.status,
    remarks: record.remarks,
    lockedAt: record.lockedAt?.toISOString() ?? null
  }));
}

export async function listClassSectionsAttendanceStatusForDate(ctx: TenantContext, input: unknown = {}) {
  const params = classSectionsNotMarkedReportFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx);
  if (!scope) return [];

  const attendanceDate = normalizeDateOnly(params.attendanceDate);
  const holiday = await findApplicableCalendarEntry(db, {
    tenantId: ctx.tenantId,
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    attendanceDate,
    audience: "STUDENTS"
  });
  if (holiday) return [];
  const classSections = await db.classSection.findMany({
    where: {
      ...scope.classSectionFilter,
      id: params.classSectionId
    },
    include: {
      classTeacherUser: { select: { displayName: true, firstName: true, lastName: true, email: true } },
      enrollments: {
        where: {
          tenantId: ctx.tenantId,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          status: "ACTIVE",
          enrolledOn: { lte: attendanceDate },
          OR: [{ leftOn: null }, { leftOn: { gte: attendanceDate } }],
          student: {
            tenantId: ctx.tenantId,
            branchId: scope.branchId,
            status: "ACTIVE"
          }
        },
        select: { studentId: true }
      },
      studentAttendanceRecords: {
        where: {
          tenantId: ctx.tenantId,
          branchId: scope.branchId,
          academicYearId: scope.academicYearId,
          attendanceDate,
          sessionType: "FULL_DAY"
        },
        select: { studentId: true }
      }
    },
    orderBy: [{ academicClass: { sortOrder: "asc" } }, { section: { sortOrder: "asc" } }]
  });

  return classSections.map((classSection): ClassSectionAttendanceStatusRow => {
    const activeStudentIds = new Set(classSection.enrollments.map((enrollment) => enrollment.studentId));
    const markedCount = classSection.studentAttendanceRecords.filter((record) => activeStudentIds.has(record.studentId)).length;
    const activeEnrollmentCount = activeStudentIds.size;
    const pendingCount = Math.max(activeEnrollmentCount - markedCount, 0);
    const status =
      markedCount === 0 ? "NOT_MARKED" :
      pendingCount > 0 ? "PARTIALLY_MARKED" :
      "MARKED";

    return {
      classSectionId: classSection.id,
      classSectionName: classSection.displayName,
      classTeacherName: classSection.classTeacherUser ? teacherDisplayName(classSection.classTeacherUser) : null,
      activeEnrollmentCount,
      markedCount,
      pendingCount,
      status
    };
  });
}

export async function getMonthlyAttendancePercentageByClassSection(ctx: TenantContext, input: unknown = {}) {
  const params = monthlyAttendancePercentageFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx);
  if (!scope || !params.classSectionId) return [];

  const classSection = await db.classSection.findFirst({
    where: {
      ...scope.classSectionFilter,
      id: params.classSectionId
    },
    select: { id: true }
  });
  if (!classSection) return [];

  const { startDate, endDate } = monthRange(params.year, params.month);
  const enrollments = await db.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      classSectionId: classSection.id,
      status: "ACTIVE",
      enrolledOn: { lte: endDate },
      OR: [{ leftOn: null }, { leftOn: { gte: startDate } }],
      student: {
        tenantId: ctx.tenantId,
        branchId: scope.branchId,
        status: "ACTIVE"
      }
    },
    select: {
      studentId: true,
      rollNumber: true,
      student: {
        select: {
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true
        }
      }
    },
    orderBy: [
      { rollNumber: "asc" },
      { student: { displayName: "asc" } },
      { student: { admissionNumber: "asc" } }
    ]
  });

  if (enrollments.length === 0) return [];

  const records = await db.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      classSectionId: classSection.id,
      attendanceDate: { gte: startDate, lte: endDate },
      sessionType: "FULL_DAY",
      studentId: { in: enrollments.map((enrollment) => enrollment.studentId) }
    },
    select: {
      studentId: true,
      status: true
    }
  });

  const recordsByStudentId = new Map<string, Array<{ status: StudentAttendanceStatus }>>();
  for (const record of records) {
    const studentRecords = recordsByStudentId.get(record.studentId) ?? [];
    studentRecords.push(record);
    recordsByStudentId.set(record.studentId, studentRecords);
  }

  return enrollments.map((enrollment): MonthlyAttendancePercentageRow => {
    const studentRecords = recordsByStudentId.get(enrollment.studentId) ?? [];
    const markedDays = studentRecords.length;
    const presentEquivalentDays = studentRecords.reduce((total, record) => total + presentEquivalent(record.status), 0);
    const absentDays = studentRecords.filter((record) => record.status === "ABSENT").length;
    const lateDays = studentRecords.filter((record) => record.status === "LATE").length;
    const halfDayDays = studentRecords.filter((record) => record.status === "HALF_DAY").length;

    return {
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      admissionNo: enrollment.student.admissionNumber,
      studentName: displayName(enrollment.student),
      presentEquivalentDays,
      markedDays,
      absentDays,
      lateDays,
      halfDayDays,
      attendancePercentage: markedDays > 0 ? roundPercentage((presentEquivalentDays / markedDays) * 100) : 0
    };
  });
}
