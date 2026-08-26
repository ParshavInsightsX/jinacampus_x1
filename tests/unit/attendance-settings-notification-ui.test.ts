import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CampusCore attendance notification settings UI", () => {
  it("renders safe permission and provider status states for notification controls", () => {
    const route = source("src/app/(dashboard)/campus-core/settings/page.tsx");

    expect(route).toContain("PermissionState");
    expect(route).toContain("getEffectivePermissions");
    expect(route).toContain('permissions.has("campuscore.settings.manage")');
    expect(route).toContain('permissions.has("notifications.settings.manage")');
    expect(route).toContain("WhatsApp notification status");
    expect(route).toContain("DRY_RUN / provider not configured");
    expect(route).toContain("without sending real WhatsApp messages");
    expect(route).toContain("Student, weekly, and monthly templates active");
  });

  it("loads notification status without selecting provider secrets", () => {
    const queries = source("src/modules/campus-core/queries.ts");

    expect(queries).toContain("getAttendanceNotificationStatus");
    expect(queries).toContain("phoneNumberId");
    expect(queries).toContain("businessAccountId");
    expect(queries).not.toContain("accessTokenEncrypted: true");
    expect(queries).not.toContain("webhookVerifyTokenHash: true");
  });

  it("guards notification setting updates with the notification settings permission", () => {
    const services = source("src/modules/campus-core/services/index.ts");

    expect(services).toContain("notificationSettingsChanged");
    expect(services).toContain('permissions.has("notifications.settings.manage")');
    expect(services).toContain("FORBIDDEN_PERMISSION:notifications.settings.manage");
  });

  it("shows safe attendance save feedback and prevents repeated pending submissions", () => {
    const route = source("src/app/(dashboard)/campus-core/settings/page.tsx");
    const form = source("src/modules/campus-core/components/attendance-settings-form.tsx");

    expect(route).toContain("AttendanceSettingsForm");
    expect(form).toContain("useActionState");
    expect(form).toContain("FormMessage");
    expect(form).toContain("SubmitButton");
    expect(form).toContain('pendingLabel="Saving attendance settings..."');
    expect(route).toContain('type="time" name="studentAutoLockTime"');
    expect(route).toContain('type="number" min="1" max="28" name="staffMonthlySummarySendDay"');
  });
});
