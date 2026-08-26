import type { Prisma, StaffAttendanceStatus } from "@prisma/client";
import { AppError, forbidden } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { listStaffAttendanceSchema } from "@/modules/staffboard-lite/schemas";
import { pagination } from "./shared";
import { dateOnlyInTimeZone } from "@/lib/dates/time-zone";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";

export type StaffAttendanceBranchOption = {
  id: string;
  name: string;
  code: string;
  timezone: string;
};

export type StaffAttendanceAdminRow = {
  attendanceRecordId: string | null;
  staffId: string;
  employeeCode: string;
  staffName: string;
  staffType: string;
  department: string | null;
  branchName: string;
  status: StaffAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  source: string;
  correctionReason: string | null;
  flags: string[];
  reviewState: string;
  lifecycle: string;
  calendarManaged: boolean;
};

export type StaffAttendanceDailySummary = {
  totalStaff: number;
  checkedIn: number;
  present: number;
  late: number;
  halfDay: number;
  absentNotMarked: number;
  onLeaveHoliday: number;
  officialDuty: number;
  pendingReview: number;
};

export type StaffAttendanceAdminData = {
  branchOptions: StaffAttendanceBranchOption[];
  selectedBranchId: string | null;
  selectedDate: string;
  summary: StaffAttendanceDailySummary;
  rows: StaffAttendanceAdminRow[];
  totalRows: number;
  page: number;
  pageSize: number;
};

export type StaffSelfAttendanceHistoryRow = {
  attendanceRecordId: string;
  employeeCode: string;
  staffName: string;
  attendanceDate: string;
  status: StaffAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  correctionReason: string | null;
  reviewState: string;
  lifecycle: string;
  calendarManaged: boolean;
};

const EMPTY_SUMMARY: StaffAttendanceDailySummary = {
  totalStaff: 0,
  checkedIn: 0,
  present: 0,
  late: 0,
  halfDay: 0,
  absentNotMarked: 0,
  onLeaveHoliday: 0,
  officialDuty: 0,
  pendingReview: 0
};

function isForbiddenPermissionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("FORBIDDEN_");
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function staffName(staff: { firstName: string; middleName: string | null; lastName: string | null }) {
  return [staff.firstName, staff.middleName, staff.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
}

function sourceLabel(record: { checkInSource: string | null; checkOutSource: string | null; calendarEntryId: string | null } | null) {
  if (!record) return "-";
  if (record.calendarEntryId) return "ACADEMIC_CALENDAR";
  const sources = [record.checkInSource, record.checkOutSource].filter(Boolean);
  return sources.length > 0 ? Array.from(new Set(sources)).join(" / ") : "-";
}

function summarize(rows: StaffAttendanceAdminRow[]): StaffAttendanceDailySummary {
  const summary = { ...EMPTY_SUMMARY, totalStaff: rows.length };
  for (const row of rows) {
    if (row.checkInAt) summary.checkedIn += 1;
    if (row.status === "PRESENT") summary.present += 1;
    if (row.status === "LATE") summary.late += 1;
    if (row.status === "HALF_DAY") summary.halfDay += 1;
    if (row.status === "ABSENT" || row.status === "NOT_MARKED" || row.status === "INCOMPLETE") summary.absentNotMarked += 1;
    if (row.status === "ON_LEAVE" || row.status === "WEEK_OFF" || row.status === "HOLIDAY") {
      summary.onLeaveHoliday += 1;
    }
    if (row.status === "OFFICIAL_DUTY") summary.officialDuty += 1;
    if (row.reviewState === "PENDING" || row.lifecycle === "REVIEW_REQUIRED") summary.pendingReview += 1;
  }
  return summary;
}

export async function listStaffAttendanceBranchOptions(ctx: TenantContext): Promise<StaffAttendanceBranchOption[]> {
  if (ctx.accessibleBranchIds.length === 0) return [];

  const branches = await db.branch.findMany({
    where: {
      tenantId: ctx.tenantId,
      id: { in: ctx.accessibleBranchIds },
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true
    },
    orderBy: [{ name: "asc" }, { code: "asc" }]
  });

  const allowedBranches: StaffAttendanceBranchOption[] = [];
  for (const branch of branches) {
    try {
      await requirePermission({ ctx, permission: "staffboard.attendance.view", branchId: branch.id });
      await requireAttendanceEntitlements(ctx, [
        { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }
      ], { branchId: branch.id });
      allowedBranches.push(branch);
    } catch (error) {
      if (isForbiddenPermissionError(error)) continue;
      throw error;
    }
  }

  return allowedBranches;
}

export async function listStaffAttendanceForDate(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StaffAttendanceAdminData> {
  const params = listStaffAttendanceSchema.parse(input);
  const branchOptions = await listStaffAttendanceBranchOptions(ctx);
  if (branchOptions.length === 0) {
    return {
      branchOptions,
      selectedBranchId: null,
      selectedDate: toDateOnlyString(params.date ?? dateOnlyInTimeZone(new Date(), ctx.timeZone)),
      summary: EMPTY_SUMMARY,
      rows: [],
      totalRows: 0,
      page: params.page,
      pageSize: params.pageSize
    };
  }

  if (params.branchId && !branchOptions.some((branch) => branch.id === params.branchId)) {
    throw forbidden("FORBIDDEN_STAFF_ATTENDANCE_BRANCH");
  }

  const selectedBranchId =
    params.branchId ??
    (ctx.activeBranchId && branchOptions.some((branch) => branch.id === ctx.activeBranchId)
      ? ctx.activeBranchId
      : branchOptions[0].id);
  await requirePermission({ ctx, permission: "staffboard.attendance.view", branchId: selectedBranchId });
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }
  ], { branchId: selectedBranchId });

  const selectedBranch = branchOptions.find((branch) => branch.id === selectedBranchId);
  const attendanceDate = params.date ?? dateOnlyInTimeZone(new Date(), selectedBranch?.timezone ?? ctx.timeZone);
  const where: Prisma.StaffProfileWhereInput = {
    tenantId: ctx.tenantId,
    branchId: selectedBranchId,
    employmentStatus: "ACTIVE",
    staffType: params.staffType,
    department: params.department ? { contains: params.department, mode: "insensitive" } : undefined
  };
  if (params.staffId) where.id = params.staffId;
  if (params.search) {
    where.OR = [
      { employeeCode: { contains: params.search, mode: "insensitive" } },
      { firstName: { contains: params.search, mode: "insensitive" } },
      { middleName: { contains: params.search, mode: "insensitive" } },
      { lastName: { contains: params.search, mode: "insensitive" } },
      { department: { contains: params.search, mode: "insensitive" } },
      { designation: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } }
    ];
  }

  const staffProfiles = await db.staffProfile.findMany({
    where,
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      staffType: true,
      department: true,
      branch: { select: { name: true } },
      staffAttendanceRecords: {
        where: {
          tenantId: ctx.tenantId,
          branchId: selectedBranchId,
          attendanceDate
        },
        select: {
          id: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          workingMinutes: true,
          checkInSource: true,
          checkOutSource: true,
          correctionReason: true,
          flags: true,
          reviewState: true,
          lifecycle: true,
          calendarEntryId: true
        },
        take: 1
      }
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { employeeCode: "asc" }]
  });

  const allRows = staffProfiles.map<StaffAttendanceAdminRow>((staff) => {
    const record = staff.staffAttendanceRecords[0] ?? null;
    return {
      attendanceRecordId: record?.id ?? null,
      staffId: staff.id,
      employeeCode: staff.employeeCode,
      staffName: staffName(staff),
      staffType: staff.staffType,
      department: staff.department,
      branchName: staff.branch.name,
      status: record?.status ?? "NOT_MARKED",
      checkInAt: record?.checkInAt?.toISOString() ?? null,
      checkOutAt: record?.checkOutAt?.toISOString() ?? null,
      workingMinutes: record?.workingMinutes ?? null,
      source: sourceLabel(record),
      correctionReason: record?.correctionReason ?? null,
      flags: record?.flags ?? [],
      reviewState: record?.reviewState ?? "NOT_REQUIRED",
      lifecycle: record?.lifecycle ?? "OPEN",
      calendarManaged: Boolean(record?.calendarEntryId)
    };
  });
  const summary = summarize(allRows);
  const filteredRows = params.status ? allRows.filter((row) => row.status === params.status) : allRows;
  const { skip, take } = pagination(params);

  return {
    branchOptions,
    selectedBranchId,
    selectedDate: toDateOnlyString(attendanceDate),
    summary,
    rows: filteredRows.slice(skip, skip + take),
    totalRows: filteredRows.length,
    page: params.page,
    pageSize: params.pageSize
  };
}

export const getStaffAttendanceAdminPageData = listStaffAttendanceForDate;

export async function listMyStaffAttendanceHistory(
  ctx: TenantContext,
  limit = 14
): Promise<StaffSelfAttendanceHistoryRow[]> {
  const staffProfile = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      employmentStatus: "ACTIVE"
    },
    select: {
      id: true,
      branchId: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      branch: { select: { status: true } }
    }
  });

  if (!staffProfile) {
    throw new AppError("ACTIVE_STAFF_PROFILE_NOT_FOUND", "ACTIVE_STAFF_PROFILE_NOT_FOUND", 400);
  }
  if (staffProfile.branch.status !== "ACTIVE") {
    throw new AppError("STAFF_BRANCH_INACTIVE", "STAFF_BRANCH_INACTIVE", 400);
  }

  await requirePermission({
    ctx,
    permission: "staffboard.attendance.self_view",
    branchId: staffProfile.branchId
  });
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }
  ], { branchId: staffProfile.branchId });

  const records = await db.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: staffProfile.branchId,
      staffId: staffProfile.id
    },
    select: {
      id: true,
      attendanceDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workingMinutes: true,
      correctionReason: true,
      reviewState: true,
      lifecycle: true,
      calendarEntryId: true
    },
    orderBy: [{ attendanceDate: "desc" }],
    take: Math.min(Math.max(limit, 1), 31)
  });

  return records.map((record) => ({
    attendanceRecordId: record.id,
    employeeCode: staffProfile.employeeCode,
    staffName: staffName(staffProfile),
    attendanceDate: toDateOnlyString(record.attendanceDate),
    status: record.status,
    checkInAt: record.checkInAt?.toISOString() ?? null,
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    workingMinutes: record.workingMinutes,
    correctionReason: record.correctionReason,
    reviewState: record.reviewState,
    lifecycle: record.lifecycle,
    calendarManaged: Boolean(record.calendarEntryId)
  }));
}
