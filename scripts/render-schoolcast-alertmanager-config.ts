import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { renderSchoolCastAlertmanagerConfig } from "../src/modules/schoolcast/operations/alertmanager-config";

async function main() {
  const primaryWebhookUrl = process.env.SCHOOLCAST_ALERT_PRIMARY_WEBHOOK_URL ?? "";
  const backupWebhookUrl = process.env.SCHOOLCAST_ALERT_BACKUP_WEBHOOK_URL ?? "";
  if (!primaryWebhookUrl || !backupWebhookUrl) {
    throw new Error("SCHOOLCAST_ALERT_DESTINATIONS_REQUIRED");
  }

  const root = process.cwd();
  const templatePath = path.join(root, "infra", "schoolcast-self-hosted", "alertmanager", "alertmanager.template.yml");
  const outputDirectory = path.join(root, "infra", "schoolcast-self-hosted", "generated");
  const outputPath = path.join(outputDirectory, "alertmanager.yml");
  const template = await readFile(templatePath, "utf8");
  const config = renderSchoolCastAlertmanagerConfig({ template, primaryWebhookUrl, backupWebhookUrl });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, config, { encoding: "utf8", mode: 0o600 });
  await chmod(outputPath, 0o600).catch(() => undefined);
  console.info(JSON.stringify({
    ok: true,
    event: "schoolcast.alertmanager_config_rendered",
    destinations: 2,
    output: "infra/schoolcast-self-hosted/generated/alertmanager.yml"
  }));
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "SCHOOLCAST_ALERTMANAGER_CONFIG_FAILED";
  console.error(JSON.stringify({ ok: false, code }));
  process.exitCode = 1;
});
