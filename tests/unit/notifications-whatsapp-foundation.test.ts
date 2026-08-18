import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { isPermissionCode, NOTIFICATION_PERMISSIONS, PERMISSION_DEFINITIONS } from "@/lib/rbac/permissions";
import {
  EXTERNAL_NOTIFICATION_PERMISSIONS,
  IN_APP_NOTIFICATION_MANAGEMENT_PERMISSIONS,
  IN_APP_NOTIFICATION_SELF_PERMISSIONS
} from "@/modules/notifications/permissions";
import {
  updateCommunicationPreferenceSchema,
  updateNotificationAttendanceSettingsSchema
} from "@/modules/notifications/schemas";
import {
  queueStudentAttendanceWhatsAppNotifications
} from "@/modules/notifications/services/attendance-whatsapp-notification.service";
import {
  calculateStaffMonthlySummary,
  queueStaffMonthlyAttendanceWhatsAppSummaries
} from "@/modules/notifications/services/staff-monthly-whatsapp-summary.service";
import {
  queueStaffWeeklyAttendanceWhatsAppSummaries
} from "@/modules/notifications/services/staff-weekly-whatsapp-summary.service";
import {
  notificationPayloadVariables,
  processNotificationOutbox,
  queueNotificationOutboxItem
} from "@/modules/notifications/services/notification-outbox.service";
import {
  sanitizeProviderError,
  sendWhatsAppTemplateMessage
} from "@/modules/notifications/services/whatsapp-provider.service";
import {
  extractWhatsAppWebhookStatuses,
  handleWhatsAppWebhookStatus,
  normalizeWhatsAppDeliveryStatus,
  verifyWhatsAppWebhookSignature
} from "@/modules/notifications/webhooks/whatsapp-webhook.handler";
import {
  assertSafeNotificationPayload,
  buildStaffMonthlySummaryTemplatePayload,
  buildStudentAttendanceTemplatePayload,
  shouldQueueStudentAttendanceStatus,
  WHATSAPP_TEMPLATE_KEYS
} from "@/modules/notifications/templates/whatsapp-template-mapper";

const tenantId = "00000000-0000-0000-0000-000000000001";
const branchId = "00000000-0000-0000-0000-000000000002";
const academicYearId = "00000000-0000-0000-0000-000000000003";
const classSectionId = "00000000-0000-0000-0000-000000000004";
const guardianId = "00000000-0000-0000-0000-000000000005";
const staffId = "00000000-0000-0000-0000-000000000006";
const attendanceDate = new Date(Date.UTC(2026, 3, 3));

function studentRecord(status: "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_LEAVE", id = "00000000-0000-0000-0000-000000000010") {
  return {
    id,
    tenantId,
    branchId,
    academicYearId,
    attendanceDate,
    markedAt: new Date("2026-04-03T03:30:00.000Z"),
    updatedAt: new Date("2026-04-03T03:30:00.000Z"),
    status,
    student: {
      id: "00000000-0000-0000-0000-000000000020",
      admissionNumber: "SCH-001",
      firstName: "Aditi",
      middleName: null,
      lastName: "Demo",
      displayName: "Aditi Demo",
      guardianLinks: [{ isPrimary: true, relation: "FATHER", guardian: { id: guardianId, phone: null } }]
    },
    classSection: {
      displayName: "Class 1-A",
      branch: {
        timezone: "Asia/Kolkata",
        institution: {
          name: "JinaCampus Demo Institution",
          displayName: "JinaCampus Demo School"
        }
      }
    }
  };
}

function studentDeps(overrides: Partial<{
  enabled: boolean;
  mode: "DISABLED" | "EXCEPTION_ONLY" | "ALL_STATUSES";
  template: boolean;
  preference: {
    whatsappEnabled: boolean;
    whatsappNumber: string | null;
    attendanceAlertsEnabled: boolean;
    consentCapturedAt: Date | null;
  } | null;
  records: ReturnType<typeof studentRecord>[];
  queueStatus: "queued" | "alreadyQueued";
  queueThrows: boolean;
}> = {}) {
  const queued: unknown[] = [];
  const settings = {
    enabled: overrides.enabled ?? true,
    mode: overrides.mode ?? "EXCEPTION_ONLY"
  };
  const deps = {
    async loadSettings() {
      return {
        studentAttendanceWhatsAppEnabled: settings.enabled,
        studentAttendanceNotificationMode: settings.mode,
        sendStudentAbsentAlert: true,
        sendStudentLateAlert: true
      };
    },
    async loadTemplate() {
      return overrides.template === false ? null : { id: "template-id" };
    },
    async loadAttendanceRecords() {
      return overrides.records ?? [studentRecord("ABSENT")];
    },
    async loadCommunicationPreference() {
      return overrides.preference === undefined
        ? {
            whatsappEnabled: true,
            whatsappNumber: "919999999999",
            attendanceAlertsEnabled: true,
            consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
          }
        : overrides.preference;
    },
    async queueOutbox(input: unknown) {
      if (overrides.queueThrows) throw new Error("queue failed");
      queued.push(input);
      return { status: overrides.queueStatus ?? "queued", outboxId: "outbox-id" };
    }
  };
  return { deps, queued };
}

describe("student attendance WhatsApp notification rules", () => {
  it("queues ABSENT in EXCEPTION_ONLY mode", async () => {
    const { deps, queued } = studentDeps({ records: [studentRecord("ABSENT")] });
    const result = await queueStudentAttendanceWhatsAppNotifications({
      tenantId,
      branchId,
      academicYearId,
      classSectionId,
      attendanceDate
    }, deps);

    expect(result.queued).toBe(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      templateKey: WHATSAPP_TEMPLATE_KEYS.STUDENT_DAILY_ATTENDANCE_ALERT,
      recipientType: "GUARDIAN",
      recipientId: guardianId,
      idempotencyKey: expect.stringContaining("student-absence")
    });
  });

  it("queues LATE, HALF_DAY, and ON_LEAVE in EXCEPTION_ONLY mode", async () => {
    const { deps } = studentDeps({
      records: [studentRecord("LATE", "00000000-0000-0000-0000-000000000011"), studentRecord("HALF_DAY", "00000000-0000-0000-0000-000000000012"), studentRecord("ON_LEAVE", "00000000-0000-0000-0000-000000000013")]
    });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.queued).toBe(3);
  });

  it("does not queue PRESENT in EXCEPTION_ONLY mode", async () => {
    const { deps } = studentDeps({ records: [studentRecord("PRESENT")] });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.queued).toBe(0);
    expect(result.skippedStatus).toBe(1);
  });

  it("queues PRESENT in ALL_STATUSES mode", async () => {
    const { deps } = studentDeps({ mode: "ALL_STATUSES", records: [studentRecord("PRESENT")] });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.queued).toBe(1);
  });

  it("skips guardian without WhatsApp consent", async () => {
    const { deps } = studentDeps({
      preference: {
        whatsappEnabled: false,
        whatsappNumber: "919999999999",
        attendanceAlertsEnabled: true,
        consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
      }
    });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.skippedNoConsent).toBe(1);
  });

  it("skips guardian without WhatsApp phone", async () => {
    const { deps } = studentDeps({
      preference: {
        whatsappEnabled: true,
        whatsappNumber: null,
        attendanceAlertsEnabled: true,
        consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
      }
    });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.skippedNoPhone).toBe(1);
  });

  it("uses idempotency key result to prevent duplicate outbox rows", async () => {
    const { deps } = studentDeps({ queueStatus: "alreadyQueued" });
    const result = await queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps);
    expect(result.alreadyQueued).toBe(1);
    expect(result.queued).toBe(0);
  });

  it("does not throw when notification queueing fails", async () => {
    const { deps } = studentDeps({ queueThrows: true });
    await expect(queueStudentAttendanceWhatsAppNotifications({ tenantId, branchId, academicYearId, classSectionId, attendanceDate }, deps))
      .resolves.toMatchObject({ failed: 1 });
  });
});

describe("staff monthly WhatsApp summary", () => {
  it("calculates monthly summary counts and working minutes", () => {
    const summary = calculateStaffMonthlySummary(
      { id: staffId, firstName: "Anaya", middleName: null, lastName: "Teacher", phone: null },
      [
        { staffId, status: "PRESENT", workingMinutes: 480 },
        { staffId, status: "LATE", workingMinutes: 450 },
        { staffId, status: "HALF_DAY", workingMinutes: 220 },
        { staffId, status: "ON_LEAVE", workingMinutes: null },
        { staffId, status: "NOT_MARKED", workingMinutes: null }
      ]
    );
    expect(summary).toMatchObject({
      presentDays: 1,
      lateDays: 1,
      halfDayDays: 1,
      leaveDays: 1,
      absentDays: 0,
      notMarkedDays: 1,
      workingDays: 5,
      markedDays: 5,
      totalWorkingMinutes: 1150
    });
  });

  it("queues one message per eligible active staff", async () => {
    const queued: unknown[] = [];
    const result = await queueStaffMonthlyAttendanceWhatsAppSummaries({
      tenantId,
      branchId,
      year: 2026,
      month: 4
    }, {
      async loadSettings() { return { staffMonthlySummaryWhatsAppEnabled: true }; },
      async loadTemplate() { return { id: "template-id" }; },
      async loadActiveStaff() { return [{ id: staffId, firstName: "Anaya", middleName: null, lastName: "Teacher", phone: null }]; },
      async loadAttendanceRecords() { return [{ staffId, status: "PRESENT", workingMinutes: 480 }]; },
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: true,
          whatsappNumber: "919888888888",
          monthlySummaryEnabled: true,
          consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
        };
      },
      async queueOutbox(input) { queued.push(input); return { status: "queued", outboxId: "outbox-id" }; },
      async getInstitutionContext() { return { name: "JinaCampus Demo School", timeZone: "Asia/Kolkata" }; }
    });
    expect(result.queued).toBe(1);
    expect(queued[0]).toMatchObject({
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_MONTHLY_ATTENDANCE_SUMMARY,
      recipientType: "STAFF",
      idempotencyKey: `staff-monthly-summary:${tenantId}:${staffId}:2026:4`
    });
  });

  it("skips staff without consent or WhatsApp phone", async () => {
    const baseDeps = {
      async loadSettings() { return { staffMonthlySummaryWhatsAppEnabled: true }; },
      async loadTemplate() { return { id: "template-id" }; },
      async loadActiveStaff() { return [{ id: staffId, firstName: "Anaya", middleName: null, lastName: "Teacher", phone: null }]; },
      async loadAttendanceRecords() { return []; },
      async queueOutbox() { return { status: "queued" as const, outboxId: "outbox-id" }; },
      async getInstitutionContext() { return { name: "JinaCampus Demo School", timeZone: "Asia/Kolkata" }; }
    };

    const noConsent = await queueStaffMonthlyAttendanceWhatsAppSummaries({ tenantId, branchId, year: 2026, month: 4 }, {
      ...baseDeps,
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: false,
          whatsappNumber: "919888888888",
          monthlySummaryEnabled: true,
          consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
        };
      }
    });
    const noPhone = await queueStaffMonthlyAttendanceWhatsAppSummaries({ tenantId, branchId, year: 2026, month: 4 }, {
      ...baseDeps,
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: true,
          whatsappNumber: null,
          monthlySummaryEnabled: true,
          consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
        };
      }
    });

    expect(noConsent.skippedNoConsent).toBe(1);
    expect(noPhone.skippedNoPhone).toBe(1);
  });

  it("prevents duplicate monthly queue rows and excludes inactive staff from checked count", async () => {
    const result = await queueStaffMonthlyAttendanceWhatsAppSummaries({
      tenantId,
      branchId,
      year: 2026,
      month: 4
    }, {
      async loadSettings() { return { staffMonthlySummaryWhatsAppEnabled: true }; },
      async loadTemplate() { return { id: "template-id" }; },
      async loadActiveStaff() { return [{ id: staffId, firstName: "Active", middleName: null, lastName: "Staff", phone: null }]; },
      async loadAttendanceRecords() { return []; },
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: true,
          whatsappNumber: "919888888888",
          monthlySummaryEnabled: true,
          consentCapturedAt: new Date("2026-04-01T00:00:00.000Z")
        };
      },
      async queueOutbox() { return { status: "alreadyQueued", outboxId: "outbox-id" }; },
      async getInstitutionContext() { return { name: "JinaCampus Demo School", timeZone: "Asia/Kolkata" }; }
    });
    expect(result.checked).toBe(1);
    expect(result.alreadyQueued).toBe(1);
  });
});

describe("staff weekly WhatsApp summary", () => {
  it("queues a consented weekly report with a stable date-range key", async () => {
    const queued: unknown[] = [];
    const startDate = new Date("2026-03-23T00:00:00.000Z");
    const endDate = new Date("2026-03-29T00:00:00.000Z");

    const result = await queueStaffWeeklyAttendanceWhatsAppSummaries({
      tenantId,
      branchId,
      startDate,
      endDate
    }, {
      async loadSettings() { return { staffWeeklySummaryWhatsAppEnabled: true }; },
      async loadTemplate() { return { id: "template-id" }; },
      async loadActiveStaff() {
        return [{ id: staffId, firstName: "Anaya", middleName: null, lastName: "Teacher", phone: "919777777777" }];
      },
      async loadAttendanceRecords() {
        return [
          { staffId, status: "PRESENT" as const, workingMinutes: 480 },
          { staffId, status: "LATE" as const, workingMinutes: 450 },
          { staffId, status: "ABSENT" as const, workingMinutes: null }
        ];
      },
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: true,
          whatsappNumber: null,
          weeklySummaryEnabled: true,
          consentCapturedAt: new Date("2026-03-01T00:00:00.000Z")
        };
      },
      async queueOutbox(input) { queued.push(input); return { status: "queued", outboxId: "outbox-id" }; },
      async getInstitutionContext() { return { name: "JinaCampus Demo School", timeZone: "Asia/Kolkata" }; }
    });

    expect(result).toMatchObject({ checked: 1, queued: 1, skippedNoConsent: 0 });
    expect(queued[0]).toMatchObject({
      templateKey: WHATSAPP_TEMPLATE_KEYS.STAFF_WEEKLY_ATTENDANCE_SUMMARY,
      recipientPhone: "919777777777",
      idempotencyKey: `staff-weekly-summary:${tenantId}:${staffId}:2026-03-23:2026-03-29`,
      payload: expect.objectContaining({
        working_days: 3,
        present_days: 1,
        late_days: 1,
        absent_days: 1
      })
    });
  });

  it("does not queue weekly reports without explicit consent", async () => {
    const result = await queueStaffWeeklyAttendanceWhatsAppSummaries({
      tenantId,
      branchId,
      startDate: new Date("2026-03-23T00:00:00.000Z"),
      endDate: new Date("2026-03-29T00:00:00.000Z")
    }, {
      async loadSettings() { return { staffWeeklySummaryWhatsAppEnabled: true }; },
      async loadTemplate() { return { id: "template-id" }; },
      async loadActiveStaff() {
        return [{ id: staffId, firstName: "Anaya", middleName: null, lastName: "Teacher", phone: "919777777777" }];
      },
      async loadAttendanceRecords() { return []; },
      async loadCommunicationPreference() {
        return {
          whatsappEnabled: true,
          whatsappNumber: null,
          weeklySummaryEnabled: true,
          consentCapturedAt: null
        };
      },
      async queueOutbox() { return { status: "queued", outboxId: "outbox-id" }; },
      async getInstitutionContext() { return { name: "JinaCampus Demo School", timeZone: "Asia/Kolkata" }; }
    });

    expect(result).toMatchObject({ queued: 0, skippedNoConsent: 1 });
  });
});

describe("notification outbox and provider", () => {
  it("creates a queued outbox item and audits masked recipient metadata", async () => {
    const writeAudit = vi.fn();
    const result = await queueNotificationOutboxItem({
      tenantId,
      branchId,
      academicYearId,
      channel: "WHATSAPP",
      templateKey: "template",
      recipientType: "GUARDIAN",
      recipientId: guardianId,
      recipientPhone: "919999999999",
      payload: { student_name: "Aditi" },
      idempotencyKey: "unique-key"
    }, {
      async findExistingOutboxItem() { return null; },
      async createOutboxItem() { return { id: "outbox-id" }; },
      writeAudit
    });
    expect(result.status).toBe("queued");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ recipientPhone: "***9999" })
    }));
  });

  it("returns alreadyQueued without creating a duplicate outbox row", async () => {
    const createOutboxItem = vi.fn();
    const result = await queueNotificationOutboxItem({
      tenantId,
      channel: "WHATSAPP",
      templateKey: "template",
      recipientType: "STAFF",
      recipientId: staffId,
      recipientPhone: "919888888888",
      payload: { staff_name: "Anaya" },
      idempotencyKey: "duplicate-key"
    }, {
      async findExistingOutboxItem() { return { id: "existing-outbox" }; },
      createOutboxItem,
      async writeAudit() {}
    });
    expect(result).toEqual({ status: "alreadyQueued", outboxId: "existing-outbox" });
    expect(createOutboxItem).not.toHaveBeenCalled();
  });

  it("processes a queued item and marks it sent on provider success", async () => {
    const markSent = vi.fn();
    const result = await processNotificationOutbox({ tenantId, branchId, limit: 1 }, {
      async findQueued(input) {
        expect(input).toMatchObject({ tenantId, branchId, limit: 1 });
        return [{
          id: "outbox-id",
          tenantId,
          branchId,
          templateKey: "template",
          recipientPhone: "919999999999",
          payloadJson: { student_name: "Aditi" }
        }];
      },
      async findTemplate() { return { providerTemplateName: "template", languageCode: "en" }; },
      async markSending(input) {
        return {
          id: input.id,
          tenantId,
          branchId,
          templateKey: "template",
          recipientPhone: "919999999999",
          payloadJson: { student_name: "Aditi" }
        };
      },
      markSent,
      async markFailed() { throw new Error("should not fail"); },
      async sendMessage() { return { ok: true, provider: "DRY_RUN", providerMessageId: "dry-run-id" }; }
    });
    expect(result.sent).toBe(1);
    expect(markSent).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: "dry-run-id" }));
  });

  it("marks failed on provider failure", async () => {
    const markFailed = vi.fn();
    const result = await processNotificationOutbox({ tenantId, limit: 1 }, {
      async findQueued() {
        return [{ id: "outbox-id", tenantId, branchId: null, templateKey: "template", recipientPhone: "919999999999", payloadJson: {} }];
      },
      async findTemplate() { return { providerTemplateName: "template", languageCode: "en" }; },
      async markSending(row) {
        return { id: row.id, tenantId, branchId: null, templateKey: "template", recipientPhone: "919999999999", payloadJson: {} };
      },
      async markSent() { throw new Error("should not send"); },
      markFailed,
      async sendMessage() {
        return { ok: false, provider: "META_CLOUD", errorCode: "NO_PROVIDER", errorMessage: "Bearer abc123 failed" };
      }
    });
    expect(result.failed).toBe(1);
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ failureReason: "Bearer abc123 failed" }));
  });

  it("keeps provider token out of sanitized errors", () => {
    expect(sanitizeProviderError("Bearer secret-token access_token=abc123 token=xyz")).not.toMatch(/secret-token|abc123|xyz/);
  });

  it("returns dry-run success without real WhatsApp credentials", async () => {
    const previousMode = process.env.WHATSAPP_PROVIDER_MODE;
    process.env.WHATSAPP_PROVIDER_MODE = "DRY_RUN";
    const result = await sendWhatsAppTemplateMessage({
      tenantId,
      to: "919999999999",
      templateName: "template",
      languageCode: "en",
      variables: { student_name: "Aditi" }
    });
    if (previousMode === undefined) {
      delete process.env.WHATSAPP_PROVIDER_MODE;
    } else {
      process.env.WHATSAPP_PROVIDER_MODE = previousMode;
    }
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("DRY_RUN");
  });
});

describe("webhook and security boundaries", () => {
  it("normalizes and extracts WhatsApp delivery statuses", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: "wamid-1", status: "delivered" }]
          }
        }]
      }]
    };
    expect(normalizeWhatsAppDeliveryStatus("read")).toBe("READ");
    expect(extractWhatsAppWebhookStatuses(payload)).toEqual([
      expect.objectContaining({ providerMessageId: "wamid-1", status: "DELIVERED" })
    ]);
  });

  it("updates delivery status only for a known provider message", async () => {
    const recordStatus = vi.fn();
    const updated = await handleWhatsAppWebhookStatus({
      providerMessageId: "wamid-1",
      status: "READ"
    }, {
      async findDeliveryTarget() { return { tenantId, outboxId: "outbox-id", provider: "DRY_RUN" }; },
      recordStatus
    });
    const ignored = await handleWhatsAppWebhookStatus({
      providerMessageId: "unknown",
      status: "READ"
    }, {
      async findDeliveryTarget() { return null; },
      recordStatus
    });
    expect(updated).toBe("updated");
    expect(ignored).toBe("ignored");
  });

  it("verifies webhook signatures with app secret", () => {
    const body = JSON.stringify({ ok: true });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppWebhookSignature(body, signature, "secret")).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, "sha256=bad", "secret")).toBe(false);
  });

  it("separates notification self-service from Principal governance permissions", () => {
    for (const permission of NOTIFICATION_PERMISSIONS) {
      expect(isPermissionCode(permission)).toBe(true);
      expect(PERMISSION_DEFINITIONS).toContainEqual(expect.objectContaining({ code: permission, module: "NOTIFICATIONS" }));
      expect(DEFAULT_ROLE_PERMISSION_MAP.ADMIN).toContain(permission);
      expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).toContain(permission);
    }
    for (const permission of IN_APP_NOTIFICATION_SELF_PERMISSIONS) {
      expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).toContain(permission);
      expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).toContain(permission);
    }
    for (const permission of [
      ...IN_APP_NOTIFICATION_MANAGEMENT_PERMISSIONS,
      ...EXTERNAL_NOTIFICATION_PERMISSIONS
    ]) {
      expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).not.toContain(permission);
      expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain(permission);
    }
  });

  it("client-facing notification settings reject tenantId and actorUserId", () => {
    expect(updateNotificationAttendanceSettingsSchema.safeParse({
      branchId,
      tenantId,
      actorUserId: "00000000-0000-0000-0000-000000000099"
    }).success).toBe(false);

    expect(updateCommunicationPreferenceSchema.safeParse({
      ownerType: "STAFF",
      ownerId: staffId,
      whatsappEnabled: true,
      weeklySummaryEnabled: true,
      monthlySummaryEnabled: false,
      attendanceAlertsEnabled: false,
      consentConfirmed: true,
      whatsappNumber: "919888888888",
      tenantId
    }).success).toBe(false);
  });

  it("template payloads avoid sensitive forbidden fields", () => {
    const studentPayload = buildStudentAttendanceTemplatePayload({
      studentName: "Aditi Demo",
      scholarNumber: "SCH-001",
      classSection: "Class 1-A",
      attendanceStatus: "ABSENT",
      attendanceDate: "2026-04-03",
      attendanceMarkingTime: "09:00 AM",
      institutionName: "JinaCampus Demo School"
    });
    const staffPayload = buildStaffMonthlySummaryTemplatePayload({
      staffName: "Anaya Teacher",
      month: "April 2026",
      workingDays: 22,
      markedDays: 22,
      presentDays: 20,
      lateDays: 1,
      halfDayDays: 1,
      leaveDays: 0,
      absentDays: 0,
      notMarkedDays: 0,
      weekOffDays: 4,
      holidayDays: 1,
      totalWorkingMinutes: 9600,
      institutionName: "JinaCampus Demo School"
    });
    expect(JSON.stringify(studentPayload)).not.toMatch(/tenantId|passwordHash|tokenHash|remarks/i);
    expect(JSON.stringify(staffPayload)).not.toMatch(/tenantId|passwordHash|tokenHash|remarks/i);
    expect(() => assertSafeNotificationPayload({ tokenHash: "secret" })).toThrow("FORBIDDEN_NOTIFICATION_PAYLOAD_KEY");
  });

  it("payload variables include only safe string and number values", () => {
    expect(notificationPayloadVariables({ name: "Aditi", days: 2, nested: { hidden: true } })).toEqual({ name: "Aditi", days: 2 });
  });

  it("documents status filtering helper behavior", () => {
    expect(shouldQueueStudentAttendanceStatus("DISABLED", "ABSENT")).toBe(false);
    expect(shouldQueueStudentAttendanceStatus("EXCEPTION_ONLY", "EXCUSED")).toBe(false);
    expect(shouldQueueStudentAttendanceStatus("ALL_STATUSES", "PRESENT")).toBe(true);
  });
});
