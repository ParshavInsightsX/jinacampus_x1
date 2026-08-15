import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getPrimaryMobileNavigationItems,
  getVisibleNavigationGroups,
} from "@/components/app-shell/navigation";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { detectSchoolCastAttachmentMimeType } from "@/lib/files/schoolcast-attachment-file";
import { SCHOOLCAST_PRINCIPAL_PERMISSIONS } from "@/modules/schoolcast/permissions";
import { extractResendSchoolCastWebhookEvent } from "@/modules/schoolcast/services/email-webhook.service";
import { parseClamAvResponse } from "@/modules/schoolcast/services/malware-scanner.service";
import { settleWithConcurrency } from "@/modules/schoolcast/services/worker-concurrency";
import {
  createSchoolCastCommunicationSchema,
  createSchoolCastProviderSchema,
  updateSchoolCastFeatureSettingsSchema,
} from "@/modules/schoolcast/schemas";
import {
  assertSafeSchoolCastText,
  maskSchoolCastEmail,
  maskSchoolCastPhone,
  renderSchoolCastPlainTextHtml,
  sanitizeSchoolCastError,
  schoolCastIdempotencyKey,
} from "@/modules/schoolcast/policy";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SchoolCast MVP security and release controls", () => {
  it("keeps navigation hidden by default and shows it only when the tenant flag and permission both allow it", () => {
    const permissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "schoolcast.dashboard.view",
      "schoolcast.communication.view",
      "schoolcast.inbox.view",
    ]);

    expect(getVisibleNavigationGroups(permissions).map((group) => group.title)).not.toContain("SchoolCast");
    expect(getVisibleNavigationGroups(permissions, { schoolCastEnabled: true }).map((group) => group.title)).toContain("SchoolCast");
    expect(getPrimaryMobileNavigationItems(permissions, ["PRINCIPAL"]).map((item) => item.href)).not.toContain("/schoolcast");
    expect(getPrimaryMobileNavigationItems(permissions, ["PRINCIPAL"], { schoolCastEnabled: true }).map((item) => item.href)).toContain("/schoolcast");
  });

  it("keeps provider-secret authority out of school roles", () => {
    expect(SCHOOLCAST_PRINCIPAL_PERMISSIONS).not.toContain("schoolcast.provider.manage");
    expect(SCHOOLCAST_PRINCIPAL_PERMISSIONS).not.toContain("schoolcast.provider.enable_live");
    expect(ROLE_PERMISSION_MAP.TEACHER).toContain("schoolcast.homework.create");
    expect(ROLE_PERMISSION_MAP.TEACHER).not.toContain("schoolcast.communication.approve");
    expect(ROLE_PERMISSION_MAP.STAFF).toContain("schoolcast.inbox.view");
    expect(ROLE_PERMISSION_MAP.STAFF).not.toContain("schoolcast.communication.create");
  });

  it("strips untrusted tenant, user, and role claims from public communication input", () => {
    const parsed = createSchoolCastCommunicationSchema.parse({
      tenantId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      role: "ADMINISTRATOR",
      type: "NOTICE",
      category: "GENERAL",
      title: "School notice",
      content: "The school will close at the usual time.",
      audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
      channels: ["IN_APP"],
    }) as Record<string, unknown>;

    expect(parsed).not.toHaveProperty("tenantId");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("role");
  });

  it("requires safe provider references and explicit default-off delivery settings", () => {
    expect(createSchoolCastProviderSchema.safeParse({
      channel: "EMAIL",
      providerCode: "RESEND",
      mode: "LIVE",
      senderAddress: "school@example.test",
      secretRef: "raw-secret",
    }).success).toBe(false);
    expect(createSchoolCastProviderSchema.safeParse({
      channel: "EMAIL",
      providerCode: "RESEND",
      mode: "TEST",
      senderAddress: "school@example.test",
      secretRef: "env:SCHOOLCAST_RESEND_API_KEY",
    }).success).toBe(true);
    expect(updateSchoolCastFeatureSettingsSchema.parse({
      enabled: false,
      inApp: false,
      notices: false,
      homework: false,
      approvals: false,
      email: false,
      whatsApp: false,
      automation: false,
      analytics: false,
      deliveryMode: "DRY_RUN",
      teacherDirectPublish: false,
    }).deliveryMode).toBe("DRY_RUN");
  });

  it("sanitizes content and operational errors without exposing contacts or bearer credentials", () => {
    expect(() => assertSafeSchoolCastText("<script>alert(1)</script>")).toThrow("SCHOOLCAST_UNSAFE_CONTENT");
    expect(renderSchoolCastPlainTextHtml("Hello <school> & family")).toContain("&lt;school&gt; &amp; family");
    expect(maskSchoolCastEmail("guardian@example.test")).toBe("gu******@example.test");
    expect(maskSchoolCastPhone("+91 98765 43210")).toBe("********3210");
    expect(sanitizeSchoolCastError(new Error("Bearer abc.def token=private guardian@example.test"))).not.toMatch(/abc\.def|private|guardian@example\.test/);
    expect(schoolCastIdempotencyKey(["version-1", "recipient-1", "EMAIL"]))
      .toBe(schoolCastIdempotencyKey(["version-1", "recipient-1", "EMAIL"]));
  });

  it("uses file signatures instead of trusting attachment extensions", () => {
    expect(detectSchoolCastAttachmentMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(detectSchoolCastAttachmentMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectSchoolCastAttachmentMimeType(new TextEncoder().encode("not an allowed file"))).toBeNull();
  });

  it("accepts only explicit clean or infected ClamAV responses", () => {
    expect(parseClamAvResponse("stream: OK\0")).toEqual({
      status: "CLEAN",
      engine: "clamav",
      reference: "OK",
    });
    expect(parseClamAvResponse("stream: Eicar-Signature FOUND\0")).toEqual({
      status: "INFECTED",
      engine: "clamav",
      reference: "Eicar-Signature",
    });
    expect(() => parseClamAvResponse("stream: scanner failure ERROR\0"))
      .toThrow("SCHOOLCAST_MALWARE_SCANNER_REJECTED_STREAM");
    expect(() => parseClamAvResponse("unexpected"))
      .toThrow("SCHOOLCAST_MALWARE_SCANNER_UNEXPECTED_RESPONSE");
  });

  it("bounds worker concurrency and preserves settled outcomes", async () => {
    let active = 0;
    let maxActive = 0;
    const outcomes = await settleWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
      active -= 1;
      if (value === 4) throw new Error("expected test rejection");
      return value * 2;
    });

    expect(maxActive).toBe(2);
    expect(outcomes).toHaveLength(6);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(5);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
  });

  it("keeps the migration additive, feature flags off, and delivery in DRY_RUN", () => {
    const migration = source("prisma/migrations/20260814120000_add_schoolcast_mvp_foundation/migration.sql");

    expect(migration).toContain('CREATE TABLE "schoolcast_communications"');
    expect(migration).toContain('"schoolCastEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('"schoolCastDeliveryMode" "SchoolCastDeliveryMode" NOT NULL DEFAULT \'DRY_RUN\'');
    expect(migration).toContain('"publicationAttemptCount" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('"scanAttemptCount" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('"scanAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(migration).toContain('"scanLeaseUntil" TIMESTAMP(3)');
    expect(migration).toContain('"schoolcast_attachments_scanStatus_scanAvailableAt_scanLeaseUntil_idx"');

    const schoolCastTables = [...migration.matchAll(/CREATE TABLE "(schoolcast_[^"]+)"/g)]
      .map((match) => match[1]);
    expect(schoolCastTables).toHaveLength(18);
    for (const table of schoolCastTables) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }

    expect(migration).toContain("'SCHOOLCAST'::\"PermissionModule\"");
    expect(migration).toContain("WHERE role.\"code\" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')");
    expect(migration).toContain("WHERE role.\"code\" IN ('TEACHER', 'CLASS_TEACHER')");
    expect(migration).toContain("WHERE role.\"code\" IN ('OFFICE_STAFF', 'STAFF')");
    expect(migration).not.toMatch(/WHERE role\."code" IN \([^)]*'ADMINISTRATOR'/);

    const principalSeed = migration.slice(
      migration.indexOf("-- Principals and legacy school-governance aliases"),
      migration.indexOf("-- Teachers receive assigned-class communication")
    );
    expect(principalSeed).not.toContain("schoolcast.provider.manage");
    expect(principalSeed).not.toContain("schoolcast.provider.enable_live");
    expect(principalSeed).not.toContain("schoolcast.feature.manage");
    expect(migration).not.toMatch(/^DROP\s+(?:TABLE|COLUMN|TYPE)/im);
  });

  it("requires safe attachments, leased idempotent workers, and signed webhook processing", () => {
    const publication = source("src/modules/schoolcast/services/communication.service.ts");
    const outboxWorker = source("src/modules/schoolcast/services/outbox-worker.service.ts");
    const scheduleWorker = source("src/modules/schoolcast/services/scheduled-publication-worker.service.ts");
    const webhook = source("src/app/api/webhooks/whatsapp/route.ts");
    const storage = source("src/lib/storage/supabase-storage.ts");
    const attachmentService = source("src/modules/schoolcast/services/attachment.service.ts");
    const scanWorker = source("src/modules/schoolcast/services/attachment-scan-worker.service.ts");
    const cron = source("src/app/api/cron/schoolcast/route.ts");
    const workerRunner = source("scripts/run-schoolcast-worker.ts");
    const sourceWorker = source("src/modules/schoolcast/services/source-event-worker.service.ts");
    const deliveryOperations = source("src/modules/schoolcast/services/delivery-operations.service.ts");
    const studentAttendance = source("src/modules/academia/services/student-attendance.service.ts");
    const staffAttendance = source("src/modules/staffboard-lite/services/staff-attendance.service.ts");
    const staffQr = source("src/modules/staffboard-lite/services/staff-qr.service.ts");
    const staffLeave = source("src/modules/staffboard-lite/services/staff-leave.service.ts");
    const calendar = source("src/modules/campus-core/calendar/calendar-service.ts");
    const gradebook = source("src/modules/gradebook/services/report-card.service.ts");
    const malwareScanner = source("src/modules/schoolcast/services/malware-scanner.service.ts");

    expect(publication).toContain('scanStatus: { not: "SAFE" }');
    expect(publication).toContain("skipDuplicates: true");
    expect(publication).toContain("export async function archiveSchoolCastCommunication");
    expect(publication).toContain('"schoolcast.communication.archive"');
    expect(publication).toContain("COMMUNICATION_ARCHIVED");
    expect(publication).toContain('assertSchoolCastTransition(current.status, [');
    expect(publication).toContain("pg_advisory_xact_lock");
    expect(outboxWorker).toContain("FOR UPDATE OF outbox SKIP LOCKED");
    expect(outboxWorker).toContain('action: "schoolcast.outbox.lease_recovered"');
    expect(outboxWorker).toContain('status: "SENDING", lockOwner: input.workerId');
    expect(outboxWorker).toContain('settings."schoolCastEnabled" = TRUE');
    expect(outboxWorker).toContain('outbox.providerConfig.status !== "READY"');
    expect(outboxWorker).toContain('action: "schoolcast.outbox.worker_error"');
    expect(outboxWorker).toContain("releaseFailedOutboxClaim");
    expect(outboxWorker).toContain("settleWithConcurrency");
    expect(outboxWorker).toContain("idempotencyKey");
    expect(scheduleWorker).toContain("MAX_PUBLICATION_ATTEMPTS = 8");
    expect(scheduleWorker).toContain("FOR UPDATE OF communication SKIP LOCKED");
    expect(scheduleWorker).toContain("claimedAt: candidate.claimedAt");
    expect(webhook).toContain("verifyWhatsAppWebhookSignature");
    expect(storage).toContain("SCHOOLCAST_STORAGE_BUCKET_MUST_BE_PRIVATE");
    expect(attachmentService).toContain("/schoolcast/quarantine/");
    expect(attachmentService).not.toContain("recordSchoolCastAttachmentScanResult");
    expect(scanWorker).toContain('scanLockOwner: data.workerId');
    expect(scanWorker).toContain("FOR UPDATE OF attachment SKIP LOCKED");
    expect(scanWorker).toContain('scanStatus: "SAFE"');
    expect(scanWorker).toContain("checksumSha256");
    expect(scanWorker.match(/SCHOOLCAST_ATTACHMENT_SCAN_LEASE_LOST/g)?.length).toBeGreaterThanOrEqual(3);
    expect(cron.indexOf("processSchoolCastAttachmentScans"))
      .toBeLessThan(cron.indexOf("processScheduledSchoolCastCommunications"));
    expect(cron).toContain("SCHOOLCAST_WORKER_SECRET");
    expect(cron).toContain('SCHOOLCAST_WORKER_ENABLED !== "true"');
    expect(cron).toContain('status: healthy ? 200 : 503');
    expect(cron).not.toContain("CRON_SECRET");
    expect(cron).not.toContain("request.json");
    expect(cron).not.toContain("...input");
    expect(workerRunner).toContain('SCHOOLCAST_WORKER_RUN_MODE === "ONCE"');
    expect(workerRunner).toContain('SCHOOLCAST_WORKER_ENABLED !== "true"');
    expect(workerRunner).toContain("getSchoolCastWorkerHealth");
    expect(sourceWorker).toContain("processSchoolCastSourceEvents");
    expect(sourceWorker).toContain("processGradebookSchoolCastEvents");
    expect(deliveryOperations).toContain('"schoolcast.outbox.retry"');
    expect(deliveryOperations).toContain('"schoolcast.outbox.admin_reconcile"');
    expect(studentAttendance).toContain("enqueueSchoolCastDomainEvent");
    expect(staffAttendance).toContain("enqueueStaffAttendanceSchoolCastEvent");
    expect(staffQr).toContain("enqueueStaffAttendanceSchoolCastEvent");
    expect(staffLeave).toContain("enqueueStaffLeaveSchoolCastEvent");
    expect(calendar).toContain("enqueueCalendarSchoolCastEvents");
    expect(gradebook).toContain("enqueueGradebookDomainEvent");
    expect(malwareScanner).toContain('Buffer.from("zPING\\0", "utf8")');
    expect(scanWorker).toContain("settleWithConcurrency");
    const readinessAudit = source("scripts/audit-schoolcast-release-readiness.ts");
    expect(readinessAudit).toContain("BLOCKED_PENDING_PROVIDER_AND_BUSINESS_APPROVAL");
    expect(readinessAudit).toContain("STAGING_CUTOVER_CERTIFIED_PRODUCTION_CUTOVER_PENDING");
    expect(readinessAudit).toContain("EXCLUDED_MODULE_NOT_AVAILABLE");
    expect(readinessAudit).toContain('mode: { not: "DRY_RUN" }');  });

  it("maps supported signed email callbacks without retaining recipient payload data", () => {
    expect(extractResendSchoolCastWebhookEvent({
      type: "email.delivered",
      created_at: "2026-08-14T06:30:00.000Z",
      data: { email_id: "email-provider-id", to: ["private@example.test"] },
    })).toEqual({
      providerMessageId: "email-provider-id",
      status: "DELIVERED",
      occurredAt: new Date("2026-08-14T06:30:00.000Z"),
      errorCode: undefined,
    });
    expect(extractResendSchoolCastWebhookEvent({
      type: "email.complained",
      created_at: "2026-08-14T06:31:00.000Z",
      data: { email_id: "email-provider-id" },
    })?.status).toBe("COMPLAINED");
    expect(extractResendSchoolCastWebhookEvent({
      type: "email.clicked",
      created_at: "2026-08-14T06:31:00.000Z",
      data: { email_id: "email-provider-id" },
    })).toBeNull();

    const route = source("src/app/api/webhooks/resend/route.ts");
    expect(route).toContain("const body = await request.text()");
    expect(route).toContain("new Webhook(secret).verify");
    expect(route).toContain('request.headers.get("svix-id")');
  });

  it("packages a non-root minimal worker and a route-scoped alert template", () => {
    const dockerfile = source("Dockerfile.schoolcast-worker");
    const dockerIgnore = source(".dockerignore");
    const alert = JSON.parse(source("infra/vercel/schoolcast-worker-failure-alert.json")) as {
      customAlert: { queryJsonString: string; triggerThreshold: number };
      autosubscribeOwnersInKnock: boolean;
    };

    expect(dockerfile).toContain("FROM base AS runtime");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("--external:@prisma/client");
    expect(dockerfile).not.toContain("COPY . .");
    expect(dockerIgnore).toContain(".env.*");
    expect(alert.customAlert.queryJsonString).toContain("/api/cron/schoolcast");
    expect(alert.customAlert.queryJsonString).toContain("httpStatus ge 500");
    expect(alert.customAlert.triggerThreshold).toBe(1);
    expect(alert.autosubscribeOwnersInKnock).toBe(true);
  });
  it("does not expose SchoolCast credentials through public environment variables", () => {
    const combined = [
      source(".env.example"),
      source("src/modules/schoolcast/services/provider-adapters.ts"),
      source("src/app/api/cron/schoolcast/route.ts"),
      source("src/app/api/webhooks/resend/route.ts"),
    ].join("\n");

    expect(combined).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*SCHOOLCAST/);
    expect(combined).not.toMatch(/passwordHash|tokenHash|rawToken/);
    expect(combined).toContain('SCHOOLCAST_WORKER_SECRET=""');
    expect(combined).toContain('SCHOOLCAST_MALWARE_SCANNER_MODE="DISABLED"');
  });
});