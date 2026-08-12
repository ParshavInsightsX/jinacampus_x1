import { Prisma, type StudentAttendanceStatus } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import { attendanceSnapshotIdSchema, attendanceSummaryRequestSchema } from "@/modules/gradebook/schemas/attendance.schemas";
import { resolveGradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";
import { decimal, percentage } from "@/modules/gradebook/utils/decimal";

const ATTENDANCE_POLICY = {
  version: "gradebook-attendance-v1",
  weeklyOffDay: 0,
  unmarkedTreatment: "SEPARATE",
  lateCredit: "1",
  halfDayCredit: "0.5",
  leaveCredit: "0",
  excusedDenominator: "EXCLUDED"
} as const;

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
function dayKey(value: Date) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function eachDate(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let current = startOfUtcDay(start); current <= end; current = new Date(current.getTime() + 86_400_000)) {
    dates.push(current);
  }
  return dates;
}

function averageDailyStatus(statuses: readonly StudentAttendanceStatus[]) {
  const units = statuses.map((status) => {
    switch (status) {
      case "PRESENT": return { present: 1, absent: 0, late: 0, half: 0, leave: 0, excused: 0, credit: 1, denominator: 1 };
      case "LATE": return { present: 0, absent: 0, late: 1, half: 0, leave: 0, excused: 0, credit: 1, denominator: 1 };
      case "HALF_DAY": return { present: 0, absent: 0, late: 0, half: 1, leave: 0, excused: 0, credit: 0.5, denominator: 1 };
      case "ABSENT": return { present: 0, absent: 1, late: 0, half: 0, leave: 0, excused: 0, credit: 0, denominator: 1 };
      case "ON_LEAVE": return { present: 0, absent: 0, late: 0, half: 0, leave: 1, excused: 0, credit: 0, denominator: 1 };
      case "EXCUSED": return { present: 0, absent: 0, late: 0, half: 0, leave: 0, excused: 1, credit: 0, denominator: 0 };
      case "NOT_MARKED": return { present: 0, absent: 0, late: 0, half: 0, leave: 0, excused: 0, credit: 0, denominator: 0 };
    }
  });
  const divisor = statuses.length || 1;
  return units.reduce((total, current) => ({
    present: total.present + current.present / divisor,
    absent: total.absent + current.absent / divisor,
    late: total.late + current.late / divisor,
    half: total.half + current.half / divisor,
    leave: total.leave + current.leave / divisor,
    excused: total.excused + current.excused / divisor,
    credit: total.credit + current.credit / divisor,
    denominator: total.denominator + current.denominator / divisor
  }), { present: 0, absent: 0, late: 0, half: 0, leave: 0, excused: 0, credit: 0, denominator: 0 });
}

export async function getAttendanceSummaryForGradebook(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.attendance_summary.view", feature: "reportCards" });
  const data = attendanceSummaryRequestSchema.parse(input);
  const enrollment = await db.enrollment.findFirst({
    where: {
      id: data.enrollmentId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId
    },
    include: { academicYear: true, student: { select: { id: true } } }
  });
  if (!enrollment) throw notFound("GRADEBOOK_ENROLLMENT_NOT_FOUND");
  const start = startOfUtcDay(data.periodStart);
  const end = startOfUtcDay(data.periodEnd);
  if (start < startOfUtcDay(enrollment.academicYear.startDate) || end > startOfUtcDay(enrollment.academicYear.endDate)) {
    throw new AppError("GRADEBOOK_ATTENDANCE_PERIOD_OUTSIDE_YEAR", "GRADEBOOK_ATTENDANCE_PERIOD_OUTSIDE_YEAR", 400);
  }
  if (data.termId) {
    const term = await db.gradebookExamTerm.findFirst({
      where: { id: data.termId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId }
    });
    if (!term || start < startOfUtcDay(term.startDate) || end > startOfUtcDay(term.endDate)) {
      throw new AppError("GRADEBOOK_ATTENDANCE_PERIOD_OUTSIDE_TERM", "GRADEBOOK_ATTENDANCE_PERIOD_OUTSIDE_TERM", 400);
    }
  }
  if (data.resultRunId) {
    const run = await db.gradebookResultRun.findFirst({ where: { id: data.resultRunId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
    if (!run) throw notFound("GRADEBOOK_RESULT_RUN_NOT_FOUND");
  }

  const [records, calendarEntries] = await Promise.all([
    db.studentAttendanceRecord.findMany({
      where: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        enrollmentId: enrollment.id,
        attendanceDate: { gte: start, lte: end }
      },
      select: { id: true, attendanceDate: true, sessionType: true, status: true, updatedAt: true },
      orderBy: [{ attendanceDate: "asc" }, { sessionType: "asc" }]
    }),
    db.academicCalendarEntry.findMany({
      where: {
        tenantId: request.tenantId,
        institutionId: enrollment.academicYear.institutionId,
        academicYearId: request.academicYearId,
        status: "ACTIVE",
        audiences: { has: "STUDENTS" },
        OR: [{ branchId: null }, { branchId: request.branchId }],
        startDate: { lte: end },
        endDate: { gte: start }
      },
      select: { id: true, startDate: true, endDate: true, entryType: true, updatedAt: true }
    })
  ]);
  const excludedDates = new Set<string>();
  for (const entry of calendarEntries) {
    for (const date of eachDate(entry.startDate < start ? start : entry.startDate, entry.endDate > end ? end : entry.endDate)) excludedDates.add(dayKey(date));
  }
  const eligibleDates = eachDate(start, end).filter((date) => date.getUTCDay() !== ATTENDANCE_POLICY.weeklyOffDay && !excludedDates.has(dayKey(date)));
  const recordsByDate = new Map<string, StudentAttendanceStatus[]>();
  for (const record of records) {
    const key = dayKey(record.attendanceDate);
    if (!eligibleDates.some((date) => dayKey(date) === key) || record.status === "NOT_MARKED") continue;
    const values = recordsByDate.get(key) ?? [];
    values.push(record.status);
    recordsByDate.set(key, values);
  }
  const aggregate = Array.from(recordsByDate.values()).map(averageDailyStatus).reduce((total, current) => ({
    present: total.present + current.present,
    absent: total.absent + current.absent,
    late: total.late + current.late,
    half: total.half + current.half,
    leave: total.leave + current.leave,
    excused: total.excused + current.excused,
    credit: total.credit + current.credit,
    denominator: total.denominator + current.denominator
  }), { present: 0, absent: 0, late: 0, half: 0, leave: 0, excused: 0, credit: 0, denominator: 0 });
  const sourceCutoffAt = new Date();
  const sourceHash = hashCanonicalJson({ records, calendarEntries, start: dayKey(start), end: dayKey(end) });
  const attendancePolicyHash = hashCanonicalJson(ATTENDANCE_POLICY);
  return {
    enrollment,
    input: data,
    counts: {
      eligibleDays: eligibleDates.length,
      markedDays: recordsByDate.size,
      presentDays: decimal(aggregate.present),
      absentDays: decimal(aggregate.absent),
      lateDays: decimal(aggregate.late),
      halfDays: decimal(aggregate.half),
      leaveDays: decimal(aggregate.leave),
      excusedDays: decimal(aggregate.excused),
      unmarkedDays: Math.max(0, eligibleDates.length - recordsByDate.size),
      attendancePercentage: aggregate.denominator > 0
        ? percentage(decimal(aggregate.credit), decimal(aggregate.denominator), 2, "HALF_UP")
        : null
    },
    sourceCutoffAt,
    sourceHash,
    attendancePolicyHash
  };
}

export async function createAttendanceSummarySnapshot(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.attendance_summary.generate", feature: "reportCards" });
  const summary = await getAttendanceSummaryForGradebook(ctx, input);
  const latest = await db.gradebookAttendanceSummarySnapshot.findFirst({
    where: {
      tenantId: request.tenantId,
      enrollmentId: summary.enrollment.id,
      periodStart: startOfUtcDay(summary.input.periodStart),
      periodEnd: startOfUtcDay(summary.input.periodEnd)
    },
    orderBy: { version: "desc" }
  });
  if (latest?.sourceHash === summary.sourceHash && latest.attendancePolicyHash === summary.attendancePolicyHash) return latest;
  return db.$transaction(async (tx) => {
    if (latest && latest.status !== "FROZEN") await tx.gradebookAttendanceSummarySnapshot.update({ where: { id: latest.id }, data: { status: "STALE" } });
    const snapshot = await tx.gradebookAttendanceSummarySnapshot.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        enrollmentId: summary.enrollment.id,
        studentId: summary.enrollment.studentId,
        termId: summary.input.termId,
        resultRunId: summary.input.resultRunId,
        periodStart: startOfUtcDay(summary.input.periodStart),
        periodEnd: startOfUtcDay(summary.input.periodEnd),
        ...summary.counts,
        sourceCutoffAt: summary.sourceCutoffAt,
        sourceHash: summary.sourceHash,
        attendancePolicyHash: summary.attendancePolicyHash,
        status: "GENERATED",
        version: (latest?.version ?? 0) + 1,
        generatedById: request.userId
      }
    });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.ATTENDANCE_SNAPSHOT_GENERATED,
      entityType: "GradebookAttendanceSummarySnapshot",
      entityId: snapshot.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { version: snapshot.version, status: snapshot.status, sourceHash: snapshot.sourceHash, attendancePolicyHash: snapshot.attendancePolicyHash, ...summary.counts },
      metadata: { correlationId: request.correlationId, supersededSnapshotId: latest?.id ?? null }
    }, tx);
    return snapshot;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function verifyAttendanceSummarySnapshot(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.attendance_summary.refresh", feature: "reportCards" });
  const { attendanceSnapshotId } = attendanceSnapshotIdSchema.parse(input);
  const snapshot = await db.gradebookAttendanceSummarySnapshot.findFirst({ where: { id: attendanceSnapshotId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!snapshot) throw notFound("GRADEBOOK_ATTENDANCE_SNAPSHOT_NOT_FOUND");
  if (snapshot.status !== "GENERATED") throw new AppError("GRADEBOOK_ATTENDANCE_SNAPSHOT_NOT_VERIFIABLE", "GRADEBOOK_ATTENDANCE_SNAPSHOT_NOT_VERIFIABLE", 409);
  return db.gradebookAttendanceSummarySnapshot.update({ where: { id: snapshot.id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: request.userId } });
}
