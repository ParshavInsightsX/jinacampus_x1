import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  InAppNotificationAudienceType,
  InAppNotificationCategory,
  InAppNotificationDigestMode,
  InAppNotificationPriority,
  InAppNotificationSourceModule
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { assertSameOriginNotificationRequest } from "@/modules/notifications/api-response";
import {
  normalizeNotificationDeepLink,
  priorityMeetsMinimum,
  sanitizeNotificationFailure
} from "@/modules/notifications/in-app-policy";
import {
  createInAppNotificationTemplateSchema,
  publishInAppNotificationSchema,
  updateInAppNotificationPreferencesSchema,
  updateInAppNotificationSettingSchema
} from "@/modules/notifications/schemas/in-app-notification.schema";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const userId = "11111111-1111-4111-8111-111111111111";
const institutionId = "22222222-2222-4222-8222-222222222222";

function validPublishInput() {
  return {
    eventId: "leave-action-1",
    eventType: "staff_leave.approved",
    sourceModule: InAppNotificationSourceModule.STAFFBOARD,
    sourceEntityType: "StaffLeaveApplication",
    sourceEntityId: "leave-1",
    category: InAppNotificationCategory.LEAVE,
    priority: InAppNotificationPriority.NORMAL,
    title: "Leave application approved",
    bodyPreview: "Your leave application has been approved.",
    audience: { type: InAppNotificationAudienceType.USER, userId },
    deepLink: "/staffboard/leave",
    mandatory: false,
    requiresAcknowledgement: false,
    idempotencyKey: "staff-leave:leave-1:approved"
  };
}

describe("provider-independent in-app notification core", () => {
  it("allows only approved internal deep links", () => {
    expect(normalizeNotificationDeepLink("/notifications?state=unread")).toBe("/notifications?state=unread");
    expect(normalizeNotificationDeepLink("/academia/students/student-1#profile")).toBe("/academia/students/student-1#profile");
    expect(normalizeNotificationDeepLink(null)).toBeNull();

    for (const value of [
      "https://example.com",
      "//example.com",
      "/\\example.com",
      "/administrator",
      "javascript:alert(1)"
    ]) {
      expect(() => normalizeNotificationDeepLink(value)).toThrow("INVALID_NOTIFICATION_DEEP_LINK");
    }
  });

  it("allows only equivalent local loopback aliases outside production", () => {
    expect(() => assertSameOriginNotificationRequest(new Request("http://localhost:3010/api/notifications", {
      headers: { origin: "http://127.0.0.1:3010" }
    }))).not.toThrow();
    expect(() => assertSameOriginNotificationRequest(new Request("http://localhost:3010/api/notifications", {
      headers: { origin: "http://127.0.0.1:3011" }
    }))).toThrow("FORBIDDEN_NOTIFICATION_REQUEST_ORIGIN");
    expect(() => assertSameOriginNotificationRequest(new Request("https://school.example.test/api/notifications", {
      headers: { origin: "https://attacker.example.test" }
    }))).toThrow("FORBIDDEN_NOTIFICATION_REQUEST_ORIGIN");
  });

  it("preserves priority ordering and redacts processing failures", () => {
    expect(priorityMeetsMinimum(InAppNotificationPriority.HIGH, InAppNotificationPriority.NORMAL)).toBe(true);
    expect(priorityMeetsMinimum(InAppNotificationPriority.LOW, InAppNotificationPriority.HIGH)).toBe(false);
    expect(priorityMeetsMinimum(InAppNotificationPriority.NORMAL, null)).toBe(true);

    const failure = sanitizeNotificationFailure(
      new Error("password=unsafe postgresql://user:secret@example.test/db token=unsafe")
    );
    expect(failure).toContain("[redacted]");
    expect(failure).toContain("[database-url-redacted]");
    expect(failure).not.toContain("unsafe");
    expect(failure).not.toContain("user:secret");
  });

  it("rejects client-owned tenant, branch, actor, role, and status fields", () => {
    const valid = validPublishInput();
    expect(publishInAppNotificationSchema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { tenantId: userId },
      { branchId: userId },
      { actorUserId: userId },
      { role: "PRINCIPAL" },
      { status: "PUBLISHED" }
    ]) {
      expect(publishInAppNotificationSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });

  it("validates unique preferences and strict institution governance input", () => {
    const preference = {
      category: InAppNotificationCategory.ATTENDANCE,
      enabled: true,
      minimumPriority: InAppNotificationPriority.NORMAL,
      quietHoursEnabled: false,
      quietStart: null,
      quietEnd: null,
      timeZone: "Asia/Kolkata",
      digestMode: InAppNotificationDigestMode.IMMEDIATE
    };
    expect(updateInAppNotificationPreferencesSchema.safeParse({ preferences: [preference] }).success).toBe(true);
    expect(updateInAppNotificationPreferencesSchema.safeParse({ preferences: [preference, preference] }).success).toBe(false);

    const setting = {
      scope: { type: "INSTITUTION", institutionId },
      retentionDays: 365,
      defaultPriority: InAppNotificationPriority.NORMAL,
      quietHoursStart: "21:00",
      quietHoursEnd: "07:00",
      timeZone: "Asia/Kolkata",
      mandatoryCategories: [InAppNotificationCategory.SECURITY],
      featureEnabled: true
    };
    expect(updateInAppNotificationSettingSchema.safeParse(setting).success).toBe(true);
    expect(updateInAppNotificationSettingSchema.safeParse({ ...setting, tenantId: userId }).success).toBe(false);
    expect(updateInAppNotificationSettingSchema.safeParse({ ...setting, quietHoursEnd: null }).success).toBe(false);

    const template = {
      scope: { type: "INSTITUTION", institutionId },
      templateKey: "attendance.student.absent",
      name: "Student absence",
      sourceModule: InAppNotificationSourceModule.ATTENDANCE,
      category: InAppNotificationCategory.ATTENDANCE,
      defaultPriority: InAppNotificationPriority.HIGH,
      titleTemplate: "{{studentName}} is absent",
      bodyTemplate: "Attendance was marked on {{attendanceDate}}.",
      deepLinkTemplate: "/academia/students/{{studentId}}",
      requiredVariables: ["studentName", "attendanceDate", "studentId"],
      mandatory: true,
      requiresAcknowledgement: false,
      status: "ACTIVE"
    };
    expect(createInAppNotificationTemplateSchema.safeParse(template).success).toBe(true);
    expect(createInAppNotificationTemplateSchema.safeParse({ ...template, branchId: userId }).success).toBe(false);
    expect(createInAppNotificationTemplateSchema.safeParse({
      ...template,
      scope: { type: "BRANCH", branchId: userId }
    }).success).toBe(false);
  });

  it("keeps self-service permissions separate from Principal governance", () => {
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).toEqual(expect.arrayContaining([
      "notifications.access",
      "notifications.view_own",
      "notifications.mark_read",
      "notifications.preference.manage_own"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain("notifications.publish");
    expect(DEFAULT_ROLE_PERMISSION_MAP.OFFICE_STAFF).not.toContain("notifications.settings.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).toEqual(expect.arrayContaining([
      "notifications.publish",
      "notifications.template.manage",
      "notifications.settings.manage",
      "notifications.report.view",
      "notifications.retry.manage"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.ADMINISTRATOR).toEqual([]);
  });

  it("uses authenticated same-origin APIs and permission-gated management UI", () => {
    const listRoute = source("src/app/api/notifications/route.ts");
    const notificationQueries = source("src/modules/notifications/queries.ts");
    const settingsRoute = source("src/app/api/notifications/settings/route.ts");
    const templateRoute = source("src/app/api/notifications/templates/route.ts");
    const managementPage = source("src/app/(dashboard)/notifications/manage/page.tsx");
    const centrePage = source("src/app/(dashboard)/notifications/page.tsx");

    expect(listRoute).toContain("getTenantContext()");
    expect(listRoute).toContain("const input: unknown");
    expect(listRoute).toContain("assertSameOriginNotificationRequest(request)");
    expect(settingsRoute).toContain("assertSameOriginNotificationRequest(request)");
    expect(templateRoute).toContain("assertSameOriginNotificationRequest(request)");
    expect(managementPage).toContain('permissions.has("notifications.settings.manage")');
    expect(managementPage).toContain('permissions.has("notifications.template.manage")');
    expect(managementPage).toContain("<PermissionState />");
    expect(centrePage).toContain("managementPermissions.some");
    expect(notificationQueries).toContain("category: preference?.category ?? category");
    expect(notificationQueries).not.toContain("return preference ??");
  });

  it("implements polling, lifecycle guards, idempotent processing, and bounded fan-out", () => {
    const bell = source("src/components/app-shell/notification-bell.tsx");
    const recipientService = source("src/modules/notifications/services/in-app-recipient.service.ts");
    const outboxService = source("src/modules/notifications/services/in-app-notification.service.ts");
    const cronRoute = source("src/app/api/cron/in-app-notifications/route.ts");

    expect(bell).toContain("POLL_INTERVAL_MS = 45_000");
    expect(bell).toContain("let unreadCountRequest: Promise<number> | null = null");
    expect(bell).toContain("requestUnreadNotificationCount");
    expect(bell).toContain('window.addEventListener("focus"');
    expect(bell).toContain('document.addEventListener("visibilitychange"');
    expect(recipientService).toContain("NOTIFICATION_ACKNOWLEDGEMENT_REQUIRED");
    expect(recipientService).toContain("NOTIFICATION_ACKNOWLEDGEMENTS_DISABLED");
    expect(outboxService).toContain("tenantId_idempotencyKey");
    expect(outboxService).toContain("RECIPIENT_WRITE_BATCH_SIZE");
    expect(outboxService).toContain("skipDuplicates: true");
    expect(outboxService).toContain("PERMANENT_FAILURE_CODES");
    expect(outboxService).toContain("users.length !== selectedUserIds.length");
    expect(outboxService).toContain("notifications.in_app.retry_scheduled");
    expect(cronRoute).toContain("timingSafeEqual");
    expect(cronRoute).toContain("CRON_SECRET");
    expect(outboxService).not.toContain("@/modules/schoolcast");
  });

  it("preserves legacy notifications through an additive, server-only RLS migration", () => {
    const migration = source("prisma/migrations/20260818210000_add_in_app_notification_core/migration.sql");
    expect(migration).toContain("The legacy in_app_notifications columns remain mapped for rollback safety");
    expect(migration).toContain("ALTER TYPE \"RoleScope\" ADD VALUE IF NOT EXISTS 'INSTITUTION'");
    expect(migration).toContain("ALTER TYPE \"RoleAssignmentScope\" ADD VALUE IF NOT EXISTS 'INSTITUTION'");
    expect(migration).toContain('UPDATE "in_app_notifications"');
    expect(migration).toContain('INSERT INTO "in_app_notification_recipients"');
    expect(migration).toContain("'legacy:' || \"id\"::text");
    expect(migration).toContain('CREATE UNIQUE INDEX "in_app_notifications_tenant_idempotency_key"');
    expect(migration).toContain('ALTER TABLE "in_app_notification_recipients" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("Server-only Prisma access; no browser-direct policies are created");
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).toContain("'notifications.access'");
    expect(migration).toContain("'notifications.settings.manage'");
  });

  it("integrates Staff Leave through the shared notification outbox without reviving SchoolCast", () => {
    const leaveService = source("src/modules/staffboard-lite/services/staff-leave.service.ts");
    expect(leaveService).toContain("queueInAppNotificationEvent");
    expect(leaveService).toContain("queueLeaveInAppNotifications");
    expect(leaveService).toContain("STAFF_LEAVE_SUBMITTED");
    expect(leaveService).toContain("STAFF_LEAVE_WITHDRAWN");
    expect(leaveService).not.toContain("@/modules/schoolcast");
  });
});
