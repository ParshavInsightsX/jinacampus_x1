import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import {
  getZonedDateTimeParts,
  hasReachedLocalTime,
  previousCalendarMonth,
  previousCompletedDaysRange,
  safeTimeZone
} from "@/lib/dates/time-zone";
import { processNotificationOutbox } from "@/modules/notifications/services/notification-outbox.service";
import { queueStaffMonthlyAttendanceWhatsAppSummaries } from "@/modules/notifications/services/staff-monthly-whatsapp-summary.service";
import { queueStaffWeeklyAttendanceWhatsAppSummaries } from "@/modules/notifications/services/staff-weekly-whatsapp-summary.service";

export type AttendanceNotificationSchedulerResult = {
  branchesChecked: number;
  weeklyBranchesDue: number;
  monthlyBranchesDue: number;
  weeklyQueued: number;
  monthlyQueued: number;
  outboxSent: number;
  outboxFailed: number;
  failedBranches: number;
};

export async function runAttendanceNotificationScheduler(now = new Date()): Promise<AttendanceNotificationSchedulerResult> {
  const settings = await db.attendanceSetting.findMany({
    where: {
      tenant: { status: "ACTIVE" },
      branch: { status: "ACTIVE" },
      OR: [
        { studentAttendanceWhatsAppEnabled: true },
        { staffWeeklySummaryWhatsAppEnabled: true },
        { staffMonthlySummaryWhatsAppEnabled: true }
      ]
    },
    select: {
      tenantId: true,
      branchId: true,
      staffWeeklySummaryWhatsAppEnabled: true,
      staffWeeklySummarySendDay: true,
      staffWeeklySummarySendTime: true,
      staffMonthlySummaryWhatsAppEnabled: true,
      staffMonthlySummarySendDay: true,
      staffMonthlySummarySendTime: true,
      branch: { select: { timezone: true } }
    },
    take: 500
  });

  const result: AttendanceNotificationSchedulerResult = {
    branchesChecked: settings.length,
    weeklyBranchesDue: 0,
    monthlyBranchesDue: 0,
    weeklyQueued: 0,
    monthlyQueued: 0,
    outboxSent: 0,
    outboxFailed: 0,
    failedBranches: 0
  };

  for (const setting of settings) {
    try {
      let reportDeliveryAllowed = true;
      try {
        await requireAttendanceEntitlements({ tenantId: setting.tenantId, institutionId: null }, [
          { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
          { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "WRITE" }
        ], { branchId: setting.branchId });
      } catch (error) {
        if (error instanceof AppError && error.status === 403) {
          reportDeliveryAllowed = false;
        } else {
          throw error;
        }
      }

      const timeZone = safeTimeZone(setting.branch.timezone);
      const local = getZonedDateTimeParts(now, timeZone);
      const weeklyDue = reportDeliveryAllowed && setting.staffWeeklySummaryWhatsAppEnabled &&
        local.isoWeekday === setting.staffWeeklySummarySendDay &&
        hasReachedLocalTime(now, timeZone, setting.staffWeeklySummarySendTime);
      if (weeklyDue) {
        result.weeklyBranchesDue += 1;
        const range = previousCompletedDaysRange(now, timeZone, 7);
        const weekly = await queueStaffWeeklyAttendanceWhatsAppSummaries({
          tenantId: setting.tenantId,
          branchId: setting.branchId,
          startDate: range.startDate,
          endDate: range.endDate
        });
        result.weeklyQueued += weekly.queued;
      }

      const monthlyDue = reportDeliveryAllowed && setting.staffMonthlySummaryWhatsAppEnabled &&
        local.day === setting.staffMonthlySummarySendDay &&
        hasReachedLocalTime(now, timeZone, setting.staffMonthlySummarySendTime);
      if (monthlyDue) {
        result.monthlyBranchesDue += 1;
        const period = previousCalendarMonth(now, timeZone);
        const monthly = await queueStaffMonthlyAttendanceWhatsAppSummaries({
          tenantId: setting.tenantId,
          branchId: setting.branchId,
          year: period.year,
          month: period.month
        });
        result.monthlyQueued += monthly.queued;
      }

      const processed = await processNotificationOutbox({
        tenantId: setting.tenantId,
        branchId: setting.branchId,
        limit: 100
      });
      result.outboxSent += processed.sent;
      result.outboxFailed += processed.failed;
    } catch {
      result.failedBranches += 1;
    }
  }

  return result;
}
