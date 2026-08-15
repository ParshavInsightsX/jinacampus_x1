function approvedWebhook(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}_INVALID`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${label}_MUST_USE_HTTPS_WITHOUT_INLINE_CREDENTIALS`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    throw new Error(`${label}_LOCALHOST_REFUSED`);
  }
  return parsed.toString();
}

export function renderSchoolCastAlertmanagerConfig(input: {
  template: string;
  primaryWebhookUrl: string;
  backupWebhookUrl: string;
}) {
  const primary = approvedWebhook(input.primaryWebhookUrl, "SCHOOLCAST_ALERT_PRIMARY_WEBHOOK_URL");
  const backup = approvedWebhook(input.backupWebhookUrl, "SCHOOLCAST_ALERT_BACKUP_WEBHOOK_URL");
  if (primary === backup) throw new Error("SCHOOLCAST_ALERT_DESTINATIONS_MUST_BE_DISTINCT");
  if (!input.template.includes("__PRIMARY_WEBHOOK_URL__") || !input.template.includes("__BACKUP_WEBHOOK_URL__")) {
    throw new Error("SCHOOLCAST_ALERTMANAGER_TEMPLATE_INVALID");
  }
  return input.template
    .replace("__PRIMARY_WEBHOOK_URL__", JSON.stringify(primary))
    .replace("__BACKUP_WEBHOOK_URL__", JSON.stringify(backup));
}
