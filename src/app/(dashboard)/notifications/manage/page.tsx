import Link from "next/link";
import { notFound } from "next/navigation";

import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { NotificationAdministrationForms } from "@/modules/notifications/components/notification-administration-forms";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";
import {
  getInAppNotificationReport,
  getInAppNotificationSetting,
  listInAppNotificationTemplates
} from "@/modules/notifications/services/in-app-administration.service";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export default async function NotificationManagementPage() {
  const ctx = await requireAuth();
  if (!(await getInAppNotificationFeatureState(ctx.tenantId)).enabled) notFound();

  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  const canViewSettings = permissions.has("notifications.settings.view");
  const canManageSettings = permissions.has("notifications.settings.manage");
  const canViewTemplates = permissions.has("notifications.template.view");
  const canManageTemplates = permissions.has("notifications.template.manage");
  const canViewReport = permissions.has("notifications.report.view");

  if (!canViewSettings && !canManageSettings && !canViewTemplates && !canManageTemplates && !canViewReport) {
    return <PermissionState />;
  }

  const scope = ctx.institutionId
    ? { type: "INSTITUTION" as const, institutionId: ctx.institutionId }
    : { type: "TENANT" as const };
  const settingQuery = scope.type === "TENANT"
    ? { scopeType: "TENANT" as const }
    : { scopeType: "INSTITUTION" as const, scopeId: scope.institutionId };

  const [setting, templates, report] = await Promise.all([
    canViewSettings
      ? getInAppNotificationSetting(ctx, settingQuery)
      : Promise.resolve(null),
    canViewTemplates
      ? listInAppNotificationTemplates(ctx)
      : Promise.resolve([]),
    canViewReport
      ? getInAppNotificationReport(ctx, {})
      : Promise.resolve(null)
  ]);

  const initialSetting = setting ? {
    retentionDays: setting.retentionDays,
    defaultPriority: setting.defaultPriority,
    quietHoursStart: setting.quietHoursStart,
    quietHoursEnd: setting.quietHoursEnd,
    timeZone: setting.timeZone,
    mandatoryCategories: stringValues(setting.mandatoryCategories),
    featureEnabled: setting.featureEnabled
  } : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-brand-700">Governance</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-950 sm:text-3xl">Notification management</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Configure institution policy and versioned templates. Delivery remains in-app and provider independent.
          </p>
        </div>
        <Link href="/notifications" className="premium-secondary-button inline-flex min-h-11 items-center justify-center">Back to notifications</Link>
      </header>

      <NotificationAdministrationForms
        scope={scope}
        initialSetting={initialSetting}
        canManageSettings={canManageSettings}
        canManageTemplates={canManageTemplates}
      />

      {canViewTemplates ? (
        <section className="space-y-3" aria-labelledby="notification-template-list-heading">
          <div>
            <h2 id="notification-template-list-heading" className="text-lg font-bold text-brand-950">Template versions</h2>
            <p className="mt-1 text-sm text-slate-600">Historical versions remain immutable for notification traceability.</p>
          </div>
          {templates.length ? (
            <div className="overflow-x-auto rounded-lg border border-campus-border bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500">
                  <tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Module</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-campus-border">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-4 py-3"><p className="font-bold text-slate-900">{template.name}</p><p className="mt-0.5 text-xs text-slate-500">{template.templateKey}</p></td>
                      <td className="px-4 py-3 text-slate-700">{label(template.sourceModule)}</td>
                      <td className="px-4 py-3 text-slate-700">{label(template.defaultPriority)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{template.version}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{label(template.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="rounded-lg border border-campus-border bg-white p-5 text-sm text-slate-600">No templates are configured for this scope.</p>}
        </section>
      ) : null}

      {report ? (
        <section className="space-y-3" aria-labelledby="notification-report-heading">
          <div><h2 id="notification-report-heading" className="text-lg font-bold text-brand-950">Last 30 days</h2><p className="mt-1 text-sm text-slate-600">Tenant-safe delivery and engagement totals for your authorised institution scope.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Recipients", report.recipients.total],
              ["Unread", report.recipients.unread],
              ["Needs acknowledgement", report.recipients.acknowledgementPending],
              ["Archived", report.recipients.archived],
              ["Dismissed", report.recipients.dismissed]
            ].map(([name, value]) => <div key={name} className="rounded-lg border border-campus-border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{name}</p><p className="mt-2 text-2xl font-bold tabular-nums text-brand-950">{value}</p></div>)}
          </div>
        </section>
      ) : null}
    </div>
  );
}