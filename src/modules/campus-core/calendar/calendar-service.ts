import {
  Prisma,
  type AcademicCalendarAudience,
  type AcademicCalendarEntry,
  type PrismaClient
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import {
  cancelAcademicCalendarEntrySchema,
  createAcademicCalendarEntrySchema,
  updateAcademicCalendarEntrySchema,
  type CancelAcademicCalendarEntryInput,
  type CreateAcademicCalendarEntryInput,
  type UpdateAcademicCalendarEntryInput
} from "./calendar-schemas";
import {
  appliesToStaffType,
  calendarDateKey,
  enumerateCalendarDates,
  hasStaffAudience,
  normalizeCalendarDate
} from "./calendar-utils";

type DbClient = PrismaClient | Prisma.TransactionClient;
type CalendarWriteInput = CreateAcademicCalendarEntryInput | UpdateAcademicCalendarEntryInput;

type ResolvedCalendarScope = {
  institutionId: string;
  branchId: string | null;
  targetBranchIds: string[];
  academicYearId: string;
  startDate: Date;
  endDate: Date;
};

function calendarSnapshot(entry: AcademicCalendarEntry) {
  return {
    id: entry.id,
    institutionId: entry.institutionId,
    branchId: entry.branchId,
    academicYearId: entry.academicYearId,
    entryType: entry.entryType,
    name: entry.name,
    description: entry.description,
    startDate: calendarDateKey(entry.startDate),
    endDate: calendarDateKey(entry.endDate),
    audiences: entry.audiences,
    status: entry.status,
    cancellationReason: entry.cancellationReason,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null
  };
}

function staffTypeFilter(audiences: readonly AcademicCalendarAudience[]): Prisma.StaffProfileWhereInput | null {
  const teaching = audiences.includes("TEACHING_STAFF");
  const nonTeaching = audiences.includes("NON_TEACHING_STAFF");
  if (!teaching && !nonTeaching) return null;
  if (teaching && nonTeaching) return {};
  return teaching ? { staffType: "TEACHER" } : { NOT: { staffType: "TEACHER" } };
}

async function resolveCalendarScope(
  client: DbClient,
  ctx: TenantContext,
  input: CalendarWriteInput
): Promise<ResolvedCalendarScope> {
  const startDate = normalizeCalendarDate(input.startDate);
  const endDate = normalizeCalendarDate(input.endDate);
  const institution = await client.institution.findFirst({
    where: {
      id: input.institutionId,
      tenantId: ctx.tenantId,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      branches: {
        where: { tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true }
      }
    }
  });
  if (!institution) throw notFound("CALENDAR_INSTITUTION_NOT_FOUND");

  const academicYear = await client.academicYear.findFirst({
    where: {
      id: input.academicYearId,
      tenantId: ctx.tenantId,
      institutionId: institution.id,
      status: { not: "ARCHIVED" }
    },
    select: { id: true, startDate: true, endDate: true }
  });
  if (!academicYear) throw notFound("CALENDAR_ACADEMIC_YEAR_NOT_FOUND");
  if (startDate < academicYear.startDate || endDate > academicYear.endDate) {
    throw new AppError("CALENDAR_DATE_OUTSIDE_ACADEMIC_YEAR", "CALENDAR_DATE_OUTSIDE_ACADEMIC_YEAR", 400);
  }

  let targetBranchIds: string[];
  if (input.branchId) {
    const branch = await client.branch.findFirst({
      where: {
        id: input.branchId,
        tenantId: ctx.tenantId,
        institutionId: institution.id,
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!branch) throw notFound("CALENDAR_BRANCH_NOT_FOUND");
    if (!ctx.accessibleBranchIds.includes(branch.id)) throw forbidden("FORBIDDEN_BRANCH_ACCESS");
    targetBranchIds = [branch.id];
  } else {
    targetBranchIds = institution.branches.map((branch) => branch.id);
    if (targetBranchIds.length === 0) throw new AppError("CALENDAR_ACTIVE_BRANCH_REQUIRED", "CALENDAR_ACTIVE_BRANCH_REQUIRED", 400);
    if (targetBranchIds.some((branchId) => !ctx.accessibleBranchIds.includes(branchId))) {
      throw forbidden("CALENDAR_ALL_BRANCH_ACCESS_REQUIRED");
    }
  }

  for (const branchId of targetBranchIds) {
    await requirePermission({
      ctx,
      permission: "campuscore.calendar.manage",
      branchId,
      academicYearId: academicYear.id
    });
  }

  return {
    institutionId: institution.id,
    branchId: input.branchId ?? null,
    targetBranchIds,
    academicYearId: academicYear.id,
    startDate,
    endDate
  };
}

async function requireCalendarEntryAccess(client: DbClient, ctx: TenantContext, entry: AcademicCalendarEntry) {
  const input: CreateAcademicCalendarEntryInput = {
    institutionId: entry.institutionId,
    branchId: entry.branchId ?? undefined,
    academicYearId: entry.academicYearId,
    entryType: entry.entryType,
    name: entry.name,
    description: entry.description ?? undefined,
    startDate: entry.startDate,
    endDate: entry.endDate,
    audiences: entry.audiences
  };
  return resolveCalendarScope(client, ctx, input);
}

async function ensureNoCalendarOverlap(
  client: DbClient,
  ctx: TenantContext,
  input: CalendarWriteInput,
  scope: ResolvedCalendarScope,
  excludeId?: string
) {
  const overlap = await client.academicCalendarEntry.findFirst({
    where: {
      tenantId: ctx.tenantId,
      institutionId: scope.institutionId,
      academicYearId: scope.academicYearId,
      id: excludeId ? { not: excludeId } : undefined,
      status: "ACTIVE",
      startDate: { lte: scope.endDate },
      endDate: { gte: scope.startDate },
      audiences: { hasSome: input.audiences },
      ...(scope.branchId
        ? { OR: [{ branchId: null }, { branchId: scope.branchId }] }
        : {})
    },
    select: { id: true }
  });
  if (overlap) throw new AppError("CALENDAR_ENTRY_OVERLAP", "CALENDAR_ENTRY_OVERLAP", 409);
}

async function ensureNoStudentAttendanceConflict(
  client: DbClient,
  ctx: TenantContext,
  input: CalendarWriteInput,
  scope: ResolvedCalendarScope
) {
  if (!input.audiences.includes("STUDENTS")) return;
  const attendance = await client.studentAttendanceRecord.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: scope.targetBranchIds },
      academicYearId: scope.academicYearId,
      attendanceDate: { gte: scope.startDate, lte: scope.endDate }
    },
    select: { id: true }
  });
  if (attendance) {
    throw new AppError("CALENDAR_STUDENT_ATTENDANCE_CONFLICT", "CALENDAR_STUDENT_ATTENDANCE_CONFLICT", 409);
  }
}

async function ensureNoStaffLeaveConflict(
  client: DbClient,
  ctx: TenantContext,
  input: CalendarWriteInput,
  scope: ResolvedCalendarScope
) {
  const staffFilter = staffTypeFilter(input.audiences);
  if (!staffFilter) return;
  const leave = await client.staffLeaveApplication.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: scope.targetBranchIds },
      status: { in: ["PENDING", "CLARIFICATION_REQUIRED", "APPROVED"] },
      startDate: { lte: scope.endDate },
      endDate: { gte: scope.startDate },
      staff: {
        tenantId: ctx.tenantId,
        branchId: { in: scope.targetBranchIds },
        employmentStatus: "ACTIVE",
        ...staffFilter
      }
    },
    select: { id: true }
  });
  if (leave) throw new AppError("CALENDAR_STAFF_LEAVE_CONFLICT", "CALENDAR_STAFF_LEAVE_CONFLICT", 409);
}

async function releaseGeneratedHolidayRows(
  client: Prisma.TransactionClient,
  ctx: TenantContext,
  calendarEntryId: string
) {
  const rows = await client.staffAttendanceRecord.findMany({
    where: { tenantId: ctx.tenantId, calendarEntryId },
    select: {
      id: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      leaveApplicationId: true,
      correctionReason: true
    }
  });
  if (rows.some((row) => (
    row.status !== "HOLIDAY" ||
    row.checkInAt ||
    row.checkOutAt ||
    row.leaveApplicationId ||
    row.correctionReason
  ))) {
    throw new AppError("CALENDAR_STAFF_ATTENDANCE_CONFLICT", "CALENDAR_STAFF_ATTENDANCE_CONFLICT", 409);
  }
  if (rows.length) {
    await client.staffAttendanceRecord.updateMany({
      where: { tenantId: ctx.tenantId, calendarEntryId, id: { in: rows.map((row) => row.id) } },
      data: {
        status: "NOT_MARKED",
        calendarEntryId: null,
        markedById: null,
        updatedById: ctx.userId
      }
    });
  }
  return rows.length;
}

async function syncStaffHolidayRows(
  client: Prisma.TransactionClient,
  ctx: TenantContext,
  entry: AcademicCalendarEntry,
  targetBranchIds: readonly string[],
  options: { staffIds?: readonly string[]; fromDate?: Date } = {}
) {
  if (!hasStaffAudience(entry.audiences)) return { created: 0, updated: 0 };
  const staff = await client.staffProfile.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: [...targetBranchIds] },
      employmentStatus: "ACTIVE",
      id: options.staffIds ? { in: [...options.staffIds] } : undefined
    },
    select: { id: true, branchId: true, staffType: true, joiningDate: true }
  });
  const applicableStaff = staff.filter((profile) => appliesToStaffType(entry.audiences, profile.staffType));
  const dates = enumerateCalendarDates(entry.startDate, entry.endDate).filter(
    (date) => !options.fromDate || date >= normalizeCalendarDate(options.fromDate)
  );
  if (!applicableStaff.length || !dates.length) return { created: 0, updated: 0 };

  const existingRows = await client.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: [...targetBranchIds] },
      staffId: { in: applicableStaff.map((profile) => profile.id) },
      attendanceDate: { in: dates }
    }
  });
  const existingByKey = new Map(existingRows.map((row) => [`${row.staffId}:${calendarDateKey(row.attendanceDate)}`, row]));
  const safeExistingIds: string[] = [];
  const createData: Prisma.StaffAttendanceRecordCreateManyInput[] = [];

  for (const profile of applicableStaff) {
    for (const attendanceDate of dates) {
      if (profile.joiningDate && attendanceDate < normalizeCalendarDate(profile.joiningDate)) continue;
      const existing = existingByKey.get(`${profile.id}:${calendarDateKey(attendanceDate)}`);
      if (!existing) {
        createData.push({
          tenantId: ctx.tenantId,
          branchId: profile.branchId,
          academicYearId: entry.academicYearId,
          staffId: profile.id,
          attendanceDate,
          status: "HOLIDAY",
          calendarEntryId: entry.id,
          markedById: ctx.userId,
          updatedById: ctx.userId
        });
        continue;
      }
      const safePlaceholder =
        !existing.checkInAt &&
        !existing.checkOutAt &&
        !existing.leaveApplicationId &&
        !existing.correctionReason &&
        (!existing.calendarEntryId || existing.calendarEntryId === entry.id) &&
        (["ABSENT", "NOT_MARKED", "HOLIDAY"] as string[]).includes(existing.status);
      if (!safePlaceholder) {
        throw new AppError("CALENDAR_STAFF_ATTENDANCE_CONFLICT", "CALENDAR_STAFF_ATTENDANCE_CONFLICT", 409);
      }
      safeExistingIds.push(existing.id);
    }
  }

  if (safeExistingIds.length) {
    await client.staffAttendanceRecord.updateMany({
      where: { tenantId: ctx.tenantId, id: { in: safeExistingIds } },
      data: {
        academicYearId: entry.academicYearId,
        status: "HOLIDAY",
        checkInAt: null,
        checkOutAt: null,
        workingMinutes: null,
        checkInSource: null,
        checkOutSource: null,
        checkInQrTokenId: null,
        checkOutQrTokenId: null,
        calendarEntryId: entry.id,
        markedById: ctx.userId,
        updatedById: ctx.userId
      }
    });
  }
  if (createData.length) await client.staffAttendanceRecord.createMany({ data: createData });
  return { created: createData.length, updated: safeExistingIds.length };
}

export async function reconcileAcademicCalendarForStaffProfile(
  client: Prisma.TransactionClient,
  ctx: TenantContext,
  staffId: string,
  fromDate?: Date
) {
  const staff = await client.staffProfile.findFirst({
    where: { id: staffId, tenantId: ctx.tenantId },
    select: {
      id: true,
      branchId: true,
      staffType: true,
      joiningDate: true,
      createdAt: true,
      employmentStatus: true,
      branch: { select: { institutionId: true } }
    }
  });
  if (!staff) throw notFound("STAFF_PROFILE_NOT_FOUND");
  const effectiveFromDate = normalizeCalendarDate(fromDate ?? staff.joiningDate ?? staff.createdAt);
  const rows = await client.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      staffId: staff.id,
      calendarEntryId: { not: null },
      attendanceDate: { gte: effectiveFromDate }
    },
    select: {
      id: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      leaveApplicationId: true,
      correctionReason: true
    }
  });
  if (rows.some((row) => row.status !== "HOLIDAY" || row.checkInAt || row.checkOutAt || row.leaveApplicationId || row.correctionReason)) {
    throw new AppError("CALENDAR_STAFF_ATTENDANCE_CONFLICT", "CALENDAR_STAFF_ATTENDANCE_CONFLICT", 409);
  }
  if (rows.length) {
    await client.staffAttendanceRecord.updateMany({
      where: { tenantId: ctx.tenantId, id: { in: rows.map((row) => row.id) } },
      data: { status: "NOT_MARKED", calendarEntryId: null, markedById: null, updatedById: ctx.userId }
    });
  }
  if (staff.employmentStatus !== "ACTIVE") return { released: rows.length, created: 0, updated: 0 };

  const audience = staff.staffType === "TEACHER" ? "TEACHING_STAFF" : "NON_TEACHING_STAFF";
  const entries = await client.academicCalendarEntry.findMany({
    where: {
      tenantId: ctx.tenantId,
      institutionId: staff.branch.institutionId,
      status: "ACTIVE",
      endDate: { gte: effectiveFromDate },
      audiences: { has: audience },
      OR: [{ branchId: null }, { branchId: staff.branchId }]
    }
  });
  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    const result = await syncStaffHolidayRows(client, ctx, entry, [staff.branchId], {
      staffIds: [staff.id],
      fromDate: effectiveFromDate
    });
    created += result.created;
    updated += result.updated;
  }
  return { released: rows.length, created, updated };
}

async function validateCalendarWrite(
  client: DbClient,
  ctx: TenantContext,
  input: CalendarWriteInput,
  excludeId?: string
) {
  const scope = await resolveCalendarScope(client, ctx, input);
  await ensureNoCalendarOverlap(client, ctx, input, scope, excludeId);
  await ensureNoStudentAttendanceConflict(client, ctx, input, scope);
  await ensureNoStaffLeaveConflict(client, ctx, input, scope);
  return scope;
}

export async function createAcademicCalendarEntry(ctx: TenantContext, input: unknown) {
  const data = createAcademicCalendarEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await validateCalendarWrite(tx, ctx, data);
    const entry = await tx.academicCalendarEntry.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        entryType: data.entryType,
        name: data.name,
        description: data.description,
        startDate: scope.startDate,
        endDate: scope.endDate,
        audiences: data.audiences,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });
    const sync = await syncStaffHolidayRows(tx, ctx, entry, scope.targetBranchIds);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.CALENDAR_ENTRY_CREATED,
      entityType: "AcademicCalendarEntry",
      entityId: entry.id,
      branchId: entry.branchId,
      academicYearId: entry.academicYearId,
      after: calendarSnapshot(entry),
      metadata: { targetBranchCount: scope.targetBranchIds.length, staffRowsCreated: sync.created, staffRowsUpdated: sync.updated }
    }, tx);
    return calendarSnapshot(entry);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function updateAcademicCalendarEntry(ctx: TenantContext, input: unknown) {
  const data = updateAcademicCalendarEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.academicCalendarEntry.findFirst({
      where: { id: data.calendarEntryId, tenantId: ctx.tenantId, status: "ACTIVE" }
    });
    if (!before) throw notFound("CALENDAR_ENTRY_NOT_FOUND");
    await requireCalendarEntryAccess(tx, ctx, before);
    const scope = await validateCalendarWrite(tx, ctx, data, before.id);
    const released = await releaseGeneratedHolidayRows(tx, ctx, before.id);
    const entry = await tx.academicCalendarEntry.update({
      where: { id: before.id },
      data: {
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        entryType: data.entryType,
        name: data.name,
        description: data.description,
        startDate: scope.startDate,
        endDate: scope.endDate,
        audiences: data.audiences,
        updatedById: ctx.userId
      }
    });
    const sync = await syncStaffHolidayRows(tx, ctx, entry, scope.targetBranchIds);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.CALENDAR_ENTRY_UPDATED,
      entityType: "AcademicCalendarEntry",
      entityId: entry.id,
      branchId: entry.branchId,
      academicYearId: entry.academicYearId,
      before: calendarSnapshot(before),
      after: calendarSnapshot(entry),
      metadata: { releasedStaffRows: released, staffRowsCreated: sync.created, staffRowsUpdated: sync.updated }
    }, tx);
    return calendarSnapshot(entry);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

export async function cancelAcademicCalendarEntry(ctx: TenantContext, input: unknown) {
  const data: CancelAcademicCalendarEntryInput = cancelAcademicCalendarEntrySchema.parse(input);
  return db.$transaction(async (tx) => {
    const before = await tx.academicCalendarEntry.findFirst({
      where: { id: data.calendarEntryId, tenantId: ctx.tenantId, status: "ACTIVE" }
    });
    if (!before) throw notFound("CALENDAR_ENTRY_NOT_FOUND");
    await requireCalendarEntryAccess(tx, ctx, before);
    const released = await releaseGeneratedHolidayRows(tx, ctx, before.id);
    const after = await tx.academicCalendarEntry.update({
      where: { id: before.id },
      data: {
        status: "CANCELLED",
        cancellationReason: data.cancellationReason,
        cancelledAt: new Date(),
        updatedById: ctx.userId
      }
    });
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.CALENDAR_ENTRY_CANCELLED,
      entityType: "AcademicCalendarEntry",
      entityId: after.id,
      branchId: after.branchId,
      academicYearId: after.academicYearId,
      before: calendarSnapshot(before),
      after: calendarSnapshot(after),
      metadata: { releasedStaffRows: released, cancellationReason: data.cancellationReason }
    }, tx);
    return calendarSnapshot(after);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}
