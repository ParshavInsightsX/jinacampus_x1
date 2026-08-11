import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { activeEnrolledStudentsForAttendanceSchema } from "@/modules/academia/schemas";
import { findApplicableCalendarEntry } from "@/modules/campus-core/calendar/calendar-policy";

export type ActiveEnrolledStudentForAttendance = {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  rollNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  displayName: string;
  gender: string;
  status: string;
  classSectionId: string;
};

export type AttendanceClassSectionOption = {
  id: string;
  displayName: string;
  className: string;
  sectionName: string;
  branchName: string;
  academicYearName: string;
  classTeacherName: string | null;
};

export type AttendanceMarkingStudent = ActiveEnrolledStudentForAttendance & {
  attendanceRecordId: string | null;
  attendanceStatus: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_LEAVE" | "EXCUSED" | "NOT_MARKED";
  remarks: string;
  lockedAt: string | null;
};

export type StudentAttendanceMarkingState = {
  classSectionId: string;
  attendanceDate: string;
  sessionType: "FULL_DAY";
  students: AttendanceMarkingStudent[];
  existingRecordCount: number;
  lockedCount: number;
  isLocked: boolean;
  calendarEntry: { id: string; name: string; entryType: "HOLIDAY" | "NON_WORKING_DAY" } | null;
};

function parseInput(input: unknown) {
  return activeEnrolledStudentsForAttendanceSchema.parse(
    typeof input === "string" ? { classSectionId: input } : input
  );
}

function studentDisplayName(student: { displayName: string | null; firstName: string; middleName: string | null; lastName: string | null }) {
  return student.displayName ?? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function teacherDisplayName(user: { displayName: string | null; firstName: string | null; lastName: string | null; email: string }) {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

function canManageAnyClassSection(permissions: Set<string>) {
  return permissions.has("academia.attendance.update") ||
    permissions.has("academia.attendance.correct") ||
    permissions.has("academia.attendance.lock");
}

export async function listClassSectionsForAttendance(ctx: TenantContext): Promise<AttendanceClassSectionOption[]> {
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  if (!branchId || !academicYearId) return [];

  await requirePermission({
    ctx,
    permission: "academia.attendance.view",
    branchId,
    academicYearId
  });

  const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
  const canMarkAnyClassSection = canManageAnyClassSection(permissions);

  const classSections = await db.classSection.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      status: "ACTIVE",
      ...(canMarkAnyClassSection ? {} : { classTeacherUserId: ctx.userId })
    },
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

export async function listActiveEnrolledStudentsForAttendance(
  ctx: TenantContext,
  input: unknown
): Promise<ActiveEnrolledStudentForAttendance[]> {
  const params = parseInput(input);
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;

  if (!branchId || !academicYearId) return [];

  await requirePermission({
    ctx,
    permission: "academia.attendance.view",
    branchId,
    academicYearId
  });
  const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
  const canViewAnyClassSection = canManageAnyClassSection(permissions);

  const classSection = await db.classSection.findFirst({
    where: {
      id: params.classSectionId,
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      ...(canViewAnyClassSection ? {} : { classTeacherUserId: ctx.userId }),
      status: "ACTIVE"
    },
    select: { id: true, branchId: true, academicYearId: true }
  });
  if (!classSection) return [];

  const where: Prisma.EnrollmentWhereInput = {
    tenantId: ctx.tenantId,
    branchId: classSection.branchId,
    academicYearId: classSection.academicYearId,
    classSectionId: classSection.id,
    status: "ACTIVE",
    student: {
      tenantId: ctx.tenantId,
      branchId: classSection.branchId,
      status: "ACTIVE"
    }
  };

  if (params.attendanceDate) {
    where.enrolledOn = { lte: params.attendanceDate };
    where.OR = [{ leftOn: null }, { leftOn: { gte: params.attendanceDate } }];
  }

  const enrollments = await db.enrollment.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      classSectionId: true,
      rollNumber: true,
      student: {
        select: {
          admissionNumber: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true,
          gender: true,
          status: true
        }
      }
    },
    orderBy: [
      { rollNumber: "asc" },
      { student: { displayName: "asc" } },
      { student: { firstName: "asc" } },
      { student: { admissionNumber: "asc" } }
    ]
  });

  return enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    admissionNo: enrollment.student.admissionNumber,
    rollNumber: enrollment.rollNumber,
    firstName: enrollment.student.firstName,
    middleName: enrollment.student.middleName,
    lastName: enrollment.student.lastName,
    displayName: studentDisplayName(enrollment.student),
    gender: enrollment.student.gender,
    status: enrollment.student.status,
    classSectionId: enrollment.classSectionId
  }));
}

export async function getStudentAttendanceMarkingState(
  ctx: TenantContext,
  input: unknown
): Promise<StudentAttendanceMarkingState> {
  const params = parseInput(input);
  const attendanceDate = normalizeDateOnly(params.attendanceDate ?? new Date());
  const students = await listActiveEnrolledStudentsForAttendance(ctx, {
    classSectionId: params.classSectionId,
    attendanceDate
  });
  const branchId = ctx.activeBranchId ?? undefined;
  const academicYearId = ctx.activeAcademicYearId ?? undefined;
  const calendarEntry = branchId && academicYearId
    ? await findApplicableCalendarEntry(db, {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      attendanceDate,
      audience: "STUDENTS"
    })
    : null;

  if (!branchId || !academicYearId || students.length === 0 || calendarEntry) {
    return {
      classSectionId: params.classSectionId,
      attendanceDate: toDateOnlyString(attendanceDate),
      sessionType: "FULL_DAY",
      students: [],
      existingRecordCount: 0,
      lockedCount: 0,
      isLocked: false,
      calendarEntry: calendarEntry ? { id: calendarEntry.id, name: calendarEntry.name, entryType: calendarEntry.entryType } : null
    };
  }

  const studentIds = students.map((student) => student.studentId);
  const records = await db.studentAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      classSectionId: params.classSectionId,
      attendanceDate,
      sessionType: "FULL_DAY",
      studentId: { in: studentIds }
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      remarks: true,
      lockedAt: true
    }
  });
  const recordByStudentId = new Map(records.map((record) => [record.studentId, record]));
  const lockedCount = records.filter((record) => record.lockedAt).length;

  return {
    classSectionId: params.classSectionId,
    attendanceDate: toDateOnlyString(attendanceDate),
    sessionType: "FULL_DAY",
    students: students.map((student) => {
      const record = recordByStudentId.get(student.studentId);
      return {
        ...student,
        attendanceRecordId: record?.id ?? null,
        attendanceStatus: record?.status ?? "NOT_MARKED",
        remarks: record?.remarks ?? "",
        lockedAt: record?.lockedAt?.toISOString() ?? null
      };
    }),
    existingRecordCount: records.length,
    lockedCount,
    isLocked: lockedCount > 0,
    calendarEntry: null
  };
}

export const listActiveEnrollmentsByClassSectionForAttendance = listActiveEnrolledStudentsForAttendance;
