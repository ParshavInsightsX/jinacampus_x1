import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/require-auth";
import { requirePermission } from "@/lib/rbac/require-permission";
import { NotificationPreferenceEditor } from "@/modules/notifications/components/notification-preference-editor";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";

export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const ctx = await requireAuth();
  await requirePermission({ ctx, permission: "notifications.preference.manage_own", branchId: ctx.activeBranchId });
  if (!(await getInAppNotificationFeatureState(ctx.tenantId)).enabled) notFound();
  return <div className="space-y-5">
    <header><Link href="/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 premium-focus">Back to notifications</Link><h1 className="mt-1 text-2xl font-bold text-brand-950 sm:text-3xl">Notification preferences</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Control optional categories and quiet hours. The in-app centre remains available immediately; digest choices are retained for future summary delivery.</p></header>
    <NotificationPreferenceEditor />
  </div>;
}