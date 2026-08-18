export const IN_APP_NOTIFICATION_SELF_PERMISSIONS = [
  "notifications.access",
  "notifications.view_own",
  "notifications.mark_read",
  "notifications.mark_unread",
  "notifications.archive_own",
  "notifications.acknowledge",
  "notifications.preference.manage_own"
] as const;

export const IN_APP_NOTIFICATION_MANAGEMENT_PERMISSIONS = [
  "notifications.create",
  "notifications.publish",
  "notifications.schedule",
  "notifications.cancel",
  "notifications.critical.publish",
  "notifications.template.view",
  "notifications.template.manage",
  "notifications.preference.manage_institution",
  "notifications.settings.view",
  "notifications.settings.manage",
  "notifications.report.view",
  "notifications.admin.manage",
  "notifications.retry.manage"
] as const;

export const EXTERNAL_NOTIFICATION_PERMISSIONS = [
  "notifications.outbox.view",
  "notifications.outbox.process",
  "notifications.whatsapp.manage"
] as const;

export const NOTIFICATION_PERMISSIONS = [
  ...IN_APP_NOTIFICATION_SELF_PERMISSIONS,
  ...IN_APP_NOTIFICATION_MANAGEMENT_PERMISSIONS,
  ...EXTERNAL_NOTIFICATION_PERMISSIONS
] as const;

export type NotificationPermissionCode = (typeof NOTIFICATION_PERMISSIONS)[number];
