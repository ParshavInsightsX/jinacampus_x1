import { db } from "@/lib/db";
import { formatDateInTimeZone, safeTimeZone } from "@/lib/dates/time-zone";
import { queueStaffMonthlyWhatsAppSummarySchema } from "@/modules/notifications/schemas";
import {
  buildStaffMonthlySummaryTemplatePayload,
  WHATSAPP_TEMPLATE_KEYS
} from "@/modules/notifications/templates/whatsapp-template-mapper";
import {
  queueNotificationOutboxItem,
  type QueueNotificationOutboxItemInput
} from "@/modules/notifications/services/notification-outbox.service";

export type StaffMonthlyAttendanceSummary = {
  staffId: string;
  staffName: string;
  presentDays: number;
  lateDays: number;
  halfDayDays: number;
  leaveDays: number;
  absentDays: number;
  notMarkedDays: number;
  weekOffDays: number;
  holidayDays: number;
  workingDays: number;
  markedDays: number;
  totalWorkingMinutes: number;
};

export type StaffMonthlyWhatsAppQueueResult = {
  checked: number;
  queued: number;
  skippedDisabled: number;
  skippedNoConsent: number;
  skippedNoPhone: number;
  alreadyQueued: number;
  skippedTemplateMissing: number;
  failed: number;
};

export type StaffAttendanceSummaryMember = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type StaffAttendanceSummaryRecord = {
  staffId: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_LEAVE" | "OFFICIAL_DUTY" | "WEEK_OFF" | "HOLIDAY" | "INCOMPLETE" | "NOT_MARKED";
  workingMinutes: number | null;
};

type CommunicationPreferenceRecord = {
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  monthlySummaryEnabled: boolean;
  consentCapturedAt: Date | null;
};

type StaffMonthlyDeps = {
  loadSettings(input: { tenantId: string; branchId: string }): Promise<{
    staffMonthlySummaryWhatsAppEnabled: boolean;
  } | null>;
  loadTemplate(input: { tenantId: string; branchId: string; templateKey: string }): Promise<{ id: string } | null>;
  loadActiveStaff(input: { tenantId: string; branchId: string }): Promise<StaffAttendanceSummaryMember[]>;
  loadAttendanceRecords(input: {
    tenantId: string;
    branchId: string;
    staffIds: string[];
    startDate: Date;
    endDate: Date;
  }): Promise<StaffAttendanceSummaryRecord[]>;
  loadCommunicationPreference(input: {
    tenantId: string;
    branchId: string;
    staffId: string;
  }): Promise<CommunicationPreferenceRecord | null>;
  queueOutbox(input: QueueNotificationOutboxItemInput): Promise<{ status: "queued" | "alreadyQueued"; outboxId: string }>;
  getInstitutionContext(input: { tenantId: string; branchId: string }): Promise<{ name: string; timeZone: string }>;
};

function blankResult(): StaffMonthlyWhatsAppQueueResult {
  return {
    checked: 0,
    queued: 0,
    skippedDisabled: 0,
    skippedNoConsent: 0,
    skippedNoPhone: 0,
    alreadyQueued: 0,
    skippedTemplateMissing: 0,
    failed: 0
  };
}

function monthRange(year: number, month: number) {
  return {
    startDate: new Date(Date.UTC(year, month - 1, 1)),
    endDate: new Date(Date.UTC(year, month, 0))
  };
}

function staffName(staff: StaffAttendanceSummaryMember) {
  return [staff.firstName, staff.middleName, staff.lastName].map((part) => part?.trim()).filter(Boolean).join(" ");
}

function monthLabel(year: number, month: number, timeZone: string) {
  return formatDateInTimeZone(new Date(Date.UTC(year, month - 1, 15)), timeZone, {
    day: undefined,
    month: "long",
    year: "numeric"
  });
}

export function calculateStaffMonthlySummary(
  staff: StaffAttendanceSummaryMember,
  records: StaffAttendanceSummaryRecord[]
): StaffMonthlyAttendanceSummary {
  const summary: StaffMonthlyAttendanceSummary = {
    staffId: staff.id,
    staffName: staffName(staff),
    presentDays: 0,
    lateDays: 0,
    halfDayDays: 0,
    leaveDays: 0,
    absentDays: 0,
    notMarkedDays: 0,
    weekOffDays: 0,
    holidayDays: 0,
    workingDays: 0,
    markedDays: 0,
    totalWorkingMinutes: 0
  };

  for (const record of records) {
    summary.markedDays += 1;
    summary.totalWorkingMinutes += record.workingMinutes ?? 0;
    if (record.status !== "WEEK_OFF" && record.status !== "HOLIDAY") summary.workingDays += 1;
    if (record.status === "PRESENT" || record.status === "OFFICIAL_DUTY") summary.presentDays += 1;
    if (record.status === "LATE") summary.lateDays += 1;
    if (record.status === "HALF_DAY") summary.halfDayDays += 1;
    if (record.status === "ON_LEAVE") summary.leaveDays += 1;
    if (record.status === "ABSENT") summary.absentDays += 1;
    if (record.status === "NOT_MARKED" || record.status === "INCOMPLETE") summary.notMarkedDays += 1;
    if (record.status === "WEEK_OFF") summary.weekOffDays += 1;
    if (record.status === "HOLIDAY") summary.holidayDays += 1;
  }

  return summary;
}

const defaultDeps: StaffMonthlyDeps = {
  async loadSettings(input) {
    return db.attendanceSetting.findFirst({
      where: { tenantId: input.tenantId, branchId: input.branchId },
      select: { staffMonthlySummaryWhatsAppEnabled: true }
    });
  },
  async loadTemplate(input) {
    const branchTemplate = await db.notificationTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        channel: "WHATSAPP",
        templateKey: input.templateKey,
        isActive: true
      },
      select: { id: true }
    });
    if (branchTemplate) return branchTemplate;

    return db.notificationTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: null,
        channel: "WHATSAPP",
        templateKey: input.templateKey,
        isActive: true
      },
      select: { id: true }
    });
  },
  async loadActiveStaff(input) {
    return db.staffProfile.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        employmentStatus: "ACTIVE"
      },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        phone: true
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
    });
  },
  async loadAttendanceRecords(input) {
    return db.staffAttendanceRecord.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffId: { in: input.staffIds },
        attendanceDate: { gte: input.startDate, lte: input.endDate }
      },
      select: {
        staffId: true,
        status: true,
        workingMinutes: true
      }
    });
  },
  async loadCommunicationPreference(input) {
    return db.communicationPreference.findFirst({
      where: {
        tenantId: input.tenantId,
        ownerType: "STAFF",
        ownerId: input.staffId,
        OR: [{ branchId: input.branchId }, { branchId: null }]
      },
      select: {
        whatsappEnabled: true,
        whatsappNumber: true,
        monthlySummaryEnabled: true,
        consentCapturedAt: true
      },
      orderBy: { updatedAt: "desc" }
    });
  },
  async queueOutbox(input) {
    return queueNotificationOutboxItem(input);
  },
  async getInstitutionContext(input) {
    const branch = await db.branch.findFirst({
      where: { tenantId: input.tenantId, id: input.branchId },
      select: { timezone: true, institution: { select: { name: true, displayName: true } } }
    });
    return {
      name: branch?.institution.displayName ?? branch?.institution.name ?? "JinaCampus",
      timeZone: safeTimeZone(branch?.timezone)
    };
  }
};

export async function queueStaffMonthlyAttendanceWhatsAppSummaries(
  input: unknown,
  deps: StaffMonthlyDeps = defaultDeps
): Promise<StaffMonthlyWhatsAppQueueResult> {
  const data = queueStaffMonthlyWhatsAppSummarySchema.parse(input);
  const result = blankResult();

  try {
    const settings = await deps.loadSettings({ tenantId: data.tenantId, branchId: data.branchId });
    if (!settings?.staffMonthlySummaryWhatsAppEnabled) {
      result.skippedDisabled = 1;
      return result;
    }

    const template = await deps.loadTemplate({
      tenantId: data.tenantId,
      branchId: data.branchId,
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_MONTHLY_ATTENDANCE_SUMMARY
    });
    if (!template) {
      result.skippedTemplateMissing = 1;
      return result;
    }

    const staff = await deps.loadActiveStaff({ tenantId: data.tenantId, branchId: data.branchId });
    const { startDate, endDate } = monthRange(data.year, data.month);
    const records = await deps.loadAttendanceRecords({
      tenantId: data.tenantId,
      branchId: data.branchId,
      staffIds: staff.map((member) => member.id),
      startDate,
      endDate
    });
    const institution = await deps.getInstitutionContext({ tenantId: data.tenantId, branchId: data.branchId });
    const recordsByStaffId = new Map<string, StaffAttendanceSummaryRecord[]>();
    for (const record of records) {
      const staffRecords = recordsByStaffId.get(record.staffId) ?? [];
      staffRecords.push(record);
      recordsByStaffId.set(record.staffId, staffRecords);
    }

    result.checked = staff.length;
    for (const member of staff) {
      const preference = await deps.loadCommunicationPreference({
        tenantId: data.tenantId,
        branchId: data.branchId,
        staffId: member.id
      });
      if (!preference?.whatsappEnabled || !preference.monthlySummaryEnabled || !preference.consentCapturedAt) {
        result.skippedNoConsent += 1;
        continue;
      }
      const recipientPhone = preference.whatsappNumber ?? member.phone;
      if (!recipientPhone) {
        result.skippedNoPhone += 1;
        continue;
      }

      const summary = calculateStaffMonthlySummary(member, recordsByStaffId.get(member.id) ?? []);
      const queueResult = await deps.queueOutbox({
        tenantId: data.tenantId,
        branchId: data.branchId,
        academicYearId: null,
        channel: "WHATSAPP",
        templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_MONTHLY_ATTENDANCE_SUMMARY,
        recipientType: "STAFF",
        recipientId: member.id,
        recipientPhone,
        payload: buildStaffMonthlySummaryTemplatePayload({
          staffName: summary.staffName,
          month: monthLabel(data.year, data.month, institution.timeZone),
          workingDays: summary.workingDays,
          markedDays: summary.markedDays,
          presentDays: summary.presentDays,
          lateDays: summary.lateDays,
          halfDayDays: summary.halfDayDays,
          leaveDays: summary.leaveDays,
          absentDays: summary.absentDays,
          notMarkedDays: summary.notMarkedDays,
          weekOffDays: summary.weekOffDays,
          holidayDays: summary.holidayDays,
          totalWorkingMinutes: summary.totalWorkingMinutes,
          institutionName: institution.name
        }),
        idempotencyKey: `staff-monthly-summary:${data.tenantId}:${member.id}:${data.year}:${data.month}`,
        actorUserId: data.actorUserId ?? null
      });
      if (queueResult.status === "queued") result.queued += 1;
      if (queueResult.status === "alreadyQueued") result.alreadyQueued += 1;
    }

    return result;
  } catch {
    return { ...result, failed: result.failed + 1 };
  }
}
