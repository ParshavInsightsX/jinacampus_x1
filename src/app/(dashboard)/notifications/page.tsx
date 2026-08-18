import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import { NotificationCentre } from "@/modules/notifications/components/notification-centre";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await requireAuth();
  await requirePermission({ ctx, permission: "notifications.access", branchId: ctx.activeBranchId });
  if (!(await getInAppNotificationFeatureState(ctx.tenantId)).enabled) notFound();

  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  const managementPermissions = [
    "notifications.template.view",
    "notifications.template.manage",
    "notifications.settings.view",
    "notifications.settings.manage",
    "notifications.report.view"
  ] as const;
  const canManage = managementPermissions.some((permission) => permissions.has(permission));

  return <NotificationCentre canManage={canManage} />;
}