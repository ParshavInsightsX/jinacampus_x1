import type { Prisma, StaffAttendanceStatus, StaffType } from "@prisma/client";
import { forbidden } from "@/lib/errors";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import {
  staffCorrectionReportFilterSchema,
  staffDailyAttendanceReportFilterSchema,
  staffDateRangeAttendanceReportFilterSchema,
  staffMonthlyAttendanceSummaryFilterSchema
} from "@/modules/staffboard-lite/schemas";
import { pagination } from "./shared";
import { dateOnlyInTimeZone, getZonedDateTimeParts } from "@/lib/dates/time-zone";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";

export type StaffAttendanceReportBranchOption = {
  id: string;
  name: string;
  code: string;
  timezone: string;
};

type StaffAttendanceReportScope = {
  branchOptions: StaffAttendanceReportBranchOption[];
  selectedBranchId: string | null;
};

export type StaffAttendanceReportRow = {
  attendanceRecordId: string;
  attendanceDate: string;
  employeeCode: string;
  staffName: string;
  staffType: StaffType;
  department: string | null;
  status: StaffAttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  source: string;
  correctionReason: string | null;
};

export type MonthlyStaffAttendanceSummaryRow = {
  staffId: string;
  employeeCode: string;
  staffName: string;
  staffType: StaffType;
  department: string | null;
  presentDays: number;
  lateDays: number;
  halfDayDays: number;
  absentDays: number;
  onLeaveDays: number;
  holidayWeekOffDays: number;
  officialDutyDays: number;
  incompleteDays: number;
  markedDays: number;
  totalWorkingMinutes: number;
};

export type StaffManualCorrectionReportRow = {
  attendanceRecordId: string;
  attendanceDate: string;
  employeeCode: string;
  staffName: string;
  status: StaffAttendanceStatus;
  correctionReason: string;
  updatedByName: string | null;
  updatedAt: string;
};

export type StaffAttendanceReportsPageData = {
  branchOptions: StaffAttendanceReportBranchOption[];
  selectedBranchId: string | null;
  dailyRows: StaffAttendanceReportRow[];
  teacherRows: StaffAttendanceReportRow[];
  nonTeachingRows: StaffAttendanceReportRow[];
  lateRows: StaffAttendanceReportRow[];
  halfDayRows: StaffAttendanceReportRow[];
  monthlyRows: MonthlyStaffAttendanceSummaryRow[];
  correctionRows: StaffManualCorrectionReportRow[];
};

type StaffReportFilterParams = {
  branchId?: string;
  date?: Date;
  fromDate?: Date;
  toDate?: Date;
  staffType?: StaffType;
  status?: StaffAttendanceStatus;
  department?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

type ReportRecordQueryOptions = {
  exactDate?: Date;
  forcedStatus?: StaffAttendanceStatus;
  forcedStaffType?: StaffType;
  excludeTeacher?: boolean;
  correctionsOnly?: boolean;
};

type StaffAttendanceReportRecord = {
  id: string;
  attendanceDate: Date;
  status: StaffAttendanceStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workingMinutes: number | null;
  checkInSource: string | null;
  checkOutSource: string | null;
  correctionReason: string | null;
  updatedAt: Date;
  staff: {
    id: string;
    employeeCode: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    staffType: StaffType;
    department: string | null;
  };
  updatedBy: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

function isForbiddenPermissionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("FORBIDDEN_");
}

function currentMonthYear(timeZone?: string) {
  const { year, month } = getZonedDateTimeParts(new Date(), timeZone);
  return { year, month };
}

function monthRange(year: number, month: number) {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    endDate: new Date(Date.UTC(year, month, 0))
  };
}

function defaultDateRange(params: StaffReportFilterParams, timeZone?: string) {
  const today = dateOnlyInTimeZone(new Date(), timeZone);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return {
    fromDate: normalizeDateOnly(params.fromDate ?? monthStart),
    toDate: normalizeDateOnly(params.toDate ?? today)
  };
}

function normalizeDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function staffName(staff: { firstName: string; middleName: string | null; lastName: string | null }) {
  return [staff.firstName, staff.middleName, staff.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
}

function userName(user: StaffAttendanceReportRecord["updatedBy"]) {
  if (!user) return null;
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

function sourceLabel(record: { checkInSource: string | null; checkOutSource: string | null }) {
  const sources = [record.checkInSource, record.checkOutSource].filter(Boolean);
  return sources.length > 0 ? Array.from(new Set(sources)).join(" / ") : "-";
}

function staffSearchFilter(search: string) {
  return [
    { employeeCode: { contains: search, mode: "insensitive" as const } },
    { firstName: { contains: search, mode: "insensitive" as const } },
    { middleName: { contains: search, mode: "insensitive" as const } },
    { lastName: { contains: search, mode: "insensitive" as const } },
    { department: { contains: search, mode: "insensitive" as const } },
    { designation: { contains: search, mode: "insensitive" as const } },
    { phone: { contains: search, mode: "insensitive" as const } },
    { email: { contains: search, mode: "insensitive" as const } }
  ];
}

function mapReportRecord(record: StaffAttendanceReportRecord): StaffAttendanceReportRow {
  return {
    attendanceRecordId: record.id,
    attendanceDate: toDateOnlyString(record.attendanceDate),
    employeeCode: record.staff.employeeCode,
    staffName: staffName(record.staff),
    staffType: record.staff.staffType,
    department: record.staff.department,
    status: record.status,
    checkInAt: record.checkInAt?.toISOString() ?? null,
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    workingMinutes: record.workingMinutes,
    source: sourceLabel(record),
    correctionReason: record.correctionReason
  };
}

function correctionReportRow(record: StaffAttendanceReportRecord): StaffManualCorrectionReportRow {
  return {
    attendanceRecordId: record.id,
    attendanceDate: toDateOnlyString(record.attendanceDate),
    employeeCode: record.staff.employeeCode,
    staffName: staffName(record.staff),
    status: record.status,
    correctionReason: record.correctionReason ?? "",
    updatedByName: userName(record.updatedBy),
    updatedAt: record.updatedAt.toISOString()
  };
}

async function resolveReportScope(ctx: TenantContext, branchId?: string): Promise<StaffAttendanceReportScope> {
  if (ctx.accessibleBranchIds.length === 0) return { branchOptions: [], selectedBranchId: null };

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

  const branchOptions: StaffAttendanceReportBranchOption[] = [];
  for (const branch of branches) {
    try {
      await requirePermission({ ctx, permission: "staffboard.attendance.report", branchId: branch.id });
      await requireAttendanceEntitlements(ctx, [
        { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
        { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "READ" }
      ], { branchId: branch.id });
      branchOptions.push(branch);
    } catch (error) {
      if (isForbiddenPermissionError(error)) continue;
      throw error;
    }
  }

  if (branchOptions.length === 0) return { branchOptions, selectedBranchId: null };
  if (branchId && !branchOptions.some((branch) => branch.id === branchId)) {
    throw forbidden("FORBIDDEN_STAFF_ATTENDANCE_REPORT_BRANCH");
  }

  const selectedBranchId =
    branchId ??
    (ctx.activeBranchId && branchOptions.some((branch) => branch.id === ctx.activeBranchId)
      ? ctx.activeBranchId
      : branchOptions[0].id);

  await requirePermission({ ctx, permission: "staffboard.attendance.report", branchId: selectedBranchId });
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "READ" }
  ], { branchId: selectedBranchId });
  return { branchOptions, selectedBranchId };
}

function buildStaffWhere(
  ctx: TenantContext,
  branchId: string,
  params: StaffReportFilterParams,
  options: ReportRecordQueryOptions
): Prisma.StaffProfileWhereInput | null {
  if (options.excludeTeacher && params.staffType === "TEACHER") return null;

  const staffType = options.forcedStaffType ?? params.staffType;
  const where: Prisma.StaffProfileWhereInput = {
    tenantId: ctx.tenantId,
    branchId,
    staffType,
    department: params.department ? { contains: params.department, mode: "insensitive" } : undefined
  };
  if (options.excludeTeacher && !staffType) {
    where.NOT = { staffType: "TEACHER" };
  }
  if (params.search) {
    where.OR = staffSearchFilter(params.search);
  }
  return where;
}

async function findReportRecords(
  ctx: TenantContext,
  params: StaffReportFilterParams,
  options: ReportRecordQueryOptions = {}
): Promise<{ branchOptions: StaffAttendanceReportBranchOption[]; selectedBranchId: string | null; rows: StaffAttendanceReportRow[] }> {
  const scope = await resolveReportScope(ctx, params.branchId);
  if (!scope.selectedBranchId) return { ...scope, rows: [] };

  const staffWhere = buildStaffWhere(ctx, scope.selectedBranchId, params, options);
  if (!staffWhere) return { ...scope, rows: [] };

  const { fromDate, toDate } = defaultDateRange(params, ctx.timeZone);
  const dateFilter = options.exactDate
    ? normalizeDateOnly(options.exactDate)
    : { gte: fromDate, lte: toDate };
  const where: Prisma.StaffAttendanceRecordWhereInput = {
    tenantId: ctx.tenantId,
    branchId: scope.selectedBranchId,
    attendanceDate: dateFilter,
    status: options.forcedStatus ?? params.status,
    correctionReason: options.correctionsOnly ? { not: null } : undefined,
    staff: staffWhere
  };

  const records = await db.staffAttendanceRecord.findMany({
    where,
    select: {
      id: true,
      attendanceDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workingMinutes: true,
      checkInSource: true,
      checkOutSource: true,
      correctionReason: true,
      updatedAt: true,
      staff: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          middleName: true,
          lastName: true,
          staffType: true,
          department: true
        }
      },
      updatedBy: {
        select: {
          displayName: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }],
    ...pagination(params)
  });

  return { ...scope, rows: records.map(mapReportRecord) };
}

export async function listStaffAttendanceReportBranchOptions(ctx: TenantContext) {
  const scope = await resolveReportScope(ctx);
  return scope.branchOptions;
}

export async function getDailyStaffAttendanceReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffDailyAttendanceReportFilterSchema.parse(input);
  return findReportRecords(ctx, params, { exactDate: params.date ?? dateOnlyInTimeZone(new Date(), ctx.timeZone) });
}

export async function getTeacherAttendanceReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffDateRangeAttendanceReportFilterSchema.parse(input);
  return findReportRecords(ctx, params, { forcedStaffType: "TEACHER" });
}

export async function getNonTeachingStaffAttendanceReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffDateRangeAttendanceReportFilterSchema.parse(input);
  return findReportRecords(ctx, params, { excludeTeacher: true });
}

export async function getLateArrivalReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffDateRangeAttendanceReportFilterSchema.parse(input);
  return findReportRecords(ctx, params, { forcedStatus: "LATE" });
}

export async function getHalfDayStaffAttendanceReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffDateRangeAttendanceReportFilterSchema.parse(input);
  return findReportRecords(ctx, params, { forcedStatus: "HALF_DAY" });
}

export async function getMonthlyStaffAttendanceSummary(ctx: TenantContext, input: unknown = {}) {
  const params = staffMonthlyAttendanceSummaryFilterSchema.parse(input);
  const { month: currentMonth, year: currentYear } = currentMonthYear(ctx.timeZone);
  const month = params.month ?? currentMonth;
  const year = params.year ?? currentYear;
  const scope = await resolveReportScope(ctx, params.branchId);
  if (!scope.selectedBranchId) return { ...scope, rows: [] as MonthlyStaffAttendanceSummaryRow[] };

  const staffWhere = buildStaffWhere(ctx, scope.selectedBranchId, params, {});
  if (!staffWhere) return { ...scope, rows: [] as MonthlyStaffAttendanceSummaryRow[] };

  const { startDate, endDate } = monthRange(year, month);
  const records = await db.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.selectedBranchId,
      attendanceDate: { gte: startDate, lte: endDate },
      staff: staffWhere
    },
    select: {
      id: true,
      status: true,
      workingMinutes: true,
      staff: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          middleName: true,
          lastName: true,
          staffType: true,
          department: true
        }
      }
    },
    orderBy: [{ attendanceDate: "asc" }]
  });

  const summaryByStaffId = new Map<string, MonthlyStaffAttendanceSummaryRow>();
  for (const record of records) {
    const summary = summaryByStaffId.get(record.staff.id) ?? {
      staffId: record.staff.id,
      employeeCode: record.staff.employeeCode,
      staffName: staffName(record.staff),
      staffType: record.staff.staffType,
      department: record.staff.department,
      presentDays: 0,
      lateDays: 0,
      halfDayDays: 0,
      absentDays: 0,
      onLeaveDays: 0,
      holidayWeekOffDays: 0,
      officialDutyDays: 0,
      incompleteDays: 0,
      markedDays: 0,
      totalWorkingMinutes: 0
    };
    if (record.status !== "INCOMPLETE" && record.status !== "NOT_MARKED") summary.markedDays += 1;
    summary.totalWorkingMinutes += record.workingMinutes ?? 0;
    if (record.status === "PRESENT") summary.presentDays += 1;
    if (record.status === "LATE") summary.lateDays += 1;
    if (record.status === "HALF_DAY") summary.halfDayDays += 1;
    if (record.status === "ABSENT") summary.absentDays += 1;
    if (record.status === "ON_LEAVE") summary.onLeaveDays += 1;
    if (record.status === "HOLIDAY" || record.status === "WEEK_OFF") summary.holidayWeekOffDays += 1;
    if (record.status === "OFFICIAL_DUTY") summary.officialDutyDays += 1;
    if (record.status === "INCOMPLETE" || record.status === "NOT_MARKED") summary.incompleteDays += 1;
    summaryByStaffId.set(record.staff.id, summary);
  }

  const allRows = Array.from(summaryByStaffId.values()).sort((left, right) => {
    const nameCompare = left.staffName.localeCompare(right.staffName);
    return nameCompare === 0 ? left.employeeCode.localeCompare(right.employeeCode) : nameCompare;
  });
  const { skip, take } = pagination(params);
  return { ...scope, rows: allRows.slice(skip, skip + take) };
}

export async function getManualStaffCorrectionReport(ctx: TenantContext, input: unknown = {}) {
  const params = staffCorrectionReportFilterSchema.parse(input);
  const scope = await resolveReportScope(ctx, params.branchId);
  if (!scope.selectedBranchId) return { ...scope, rows: [] as StaffManualCorrectionReportRow[] };

  const staffWhere = buildStaffWhere(ctx, scope.selectedBranchId, params, {});
  if (!staffWhere) return { ...scope, rows: [] as StaffManualCorrectionReportRow[] };
  const { fromDate, toDate } = defaultDateRange(params, ctx.timeZone);
  const records = await db.staffAttendanceRecord.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.selectedBranchId,
      attendanceDate: { gte: fromDate, lte: toDate },
      correctionReason: { not: null },
      staff: staffWhere
    },
    select: {
      id: true,
      attendanceDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
      workingMinutes: true,
      checkInSource: true,
      checkOutSource: true,
      correctionReason: true,
      updatedAt: true,
      staff: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          middleName: true,
          lastName: true,
          staffType: true,
          department: true
        }
      },
      updatedBy: {
        select: {
          displayName: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: [{ attendanceDate: "desc" }, { updatedAt: "desc" }],
    ...pagination(params)
  });

  return { ...scope, rows: records.map(correctionReportRow) };
}

function pickDefined<T extends Record<string, unknown>, K extends keyof T>(input: T, keys: readonly K[]) {
  return keys.reduce<Partial<Pick<T, K>>>((picked, key) => {
    if (input[key] !== undefined) {
      picked[key] = input[key];
    }
    return picked;
  }, {});
}

export async function getStaffAttendanceReportsPageData(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StaffAttendanceReportsPageData> {
  const filters = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const dailyInput = pickDefined(filters, ["branchId", "date", "staffType", "status", "department", "search", "page", "pageSize"]);
  const dateRangeInput = pickDefined(filters, ["branchId", "fromDate", "toDate", "staffType", "status", "department", "search", "page", "pageSize"]);
  const monthlyInput = pickDefined(filters, ["branchId", "month", "year", "staffType", "department", "search", "page", "pageSize"]);

  const daily = await getDailyStaffAttendanceReport(ctx, dailyInput);
  const [
    teacher,
    nonTeaching,
    late,
    halfDay,
    monthly,
    corrections
  ] = await Promise.all([
    getTeacherAttendanceReport(ctx, dateRangeInput),
    getNonTeachingStaffAttendanceReport(ctx, dateRangeInput),
    getLateArrivalReport(ctx, dateRangeInput),
    getHalfDayStaffAttendanceReport(ctx, dateRangeInput),
    getMonthlyStaffAttendanceSummary(ctx, monthlyInput),
    getManualStaffCorrectionReport(ctx, dateRangeInput)
  ]);

  return {
    branchOptions: daily.branchOptions,
    selectedBranchId: daily.selectedBranchId,
    dailyRows: daily.rows,
    teacherRows: teacher.rows,
    nonTeachingRows: nonTeaching.rows,
    lateRows: late.rows,
    halfDayRows: halfDay.rows,
    monthlyRows: monthly.rows,
    correctionRows: corrections.rows
  };
}
