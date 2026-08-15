import { describe, expect, it } from "vitest";

import { renderSchoolCastAlertmanagerConfig } from "@/modules/schoolcast/operations/alertmanager-config";

const template = [
  "receivers:",
  "  - name: schoolcast-operations",
  "    webhook_configs:",
  "      - url: __PRIMARY_WEBHOOK_URL__",
  "      - url: __BACKUP_WEBHOOK_URL__"
].join("\n");

describe("SchoolCast Alertmanager configuration", () => {
  it("renders two distinct HTTPS destinations without logging helpers or defaults", () => {
    const config = renderSchoolCastAlertmanagerConfig({
      template,
      primaryWebhookUrl: "https://alerts-primary.example/schoolcast",
      backupWebhookUrl: "https://alerts-backup.example/schoolcast"
    });

    expect(config).toContain('"https://alerts-primary.example/schoolcast"');
    expect(config).toContain('"https://alerts-backup.example/schoolcast"');
    expect(config).not.toContain("__PRIMARY_WEBHOOK_URL__");
    expect(config).not.toContain("__BACKUP_WEBHOOK_URL__");
  });

  it("rejects duplicate, insecure, local, and credential-bearing destinations", () => {
    expect(() => renderSchoolCastAlertmanagerConfig({
      template,
      primaryWebhookUrl: "https://alerts.example/schoolcast",
      backupWebhookUrl: "https://alerts.example/schoolcast"
    })).toThrow("SCHOOLCAST_ALERT_DESTINATIONS_MUST_BE_DISTINCT");
    expect(() => renderSchoolCastAlertmanagerConfig({
      template,
      primaryWebhookUrl: "http://alerts.example/schoolcast",
      backupWebhookUrl: "https://alerts-backup.example/schoolcast"
    })).toThrow("MUST_USE_HTTPS");
    expect(() => renderSchoolCastAlertmanagerConfig({
      template,
      primaryWebhookUrl: "https://localhost/schoolcast",
      backupWebhookUrl: "https://alerts-backup.example/schoolcast"
    })).toThrow("LOCALHOST_REFUSED");
    expect(() => renderSchoolCastAlertmanagerConfig({
      template,
      primaryWebhookUrl: "https://user:secret@alerts.example/schoolcast",
      backupWebhookUrl: "https://alerts-backup.example/schoolcast"
    })).toThrow("WITHOUT_INLINE_CREDENTIALS");
  });
});
