import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listAuditLogs } from "@/modules/campus-core/queries";
import { EmptyState, PermissionState } from "@/components/ui/empty-state";
import { ResponsiveTable } from "@/components/ui/table-primitives";
import { MobileDataList, MobileDataRow } from "@/components/mobile/mobile-data-list";
import { formatDateTimeInTimeZone } from "@/lib/dates/time-zone";

export default async function AuditLogsPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("campuscore.audit.view")) return <PermissionState />;
  const logs = await listAuditLogs(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Audit Logs</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">Review critical CampusCore changes within your permitted scope.</p>
      </header>
      {logs.length ? (
        <>
          <MobileDataList label="Audit logs" className="motion-slide-up">
            {logs.map((log) => (
              <MobileDataRow
                key={log.id}
                title={log.action}
                subtitle={formatDateTimeInTimeZone(log.createdAt, ctx.timeZone)}
                details={[
                  { label: "Record type", value: log.entityType },
                  { label: "Changed by", value: log.actor?.email ?? "System" },
                  { label: "Branch", value: log.branch?.name ?? "School-wide" }
                ]}
              />
            ))}
          </MobileDataList>
          <div className="hidden md:block">
            <ResponsiveTable columns={["Created At", "Action", "Entity", "Actor", "Branch"]} caption="Audit logs table">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTimeInTimeZone(log.createdAt, ctx.timeZone)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{log.action}</td>
                  <td className="whitespace-nowrap px-4 py-3">{log.entityType}</td>
                  <td className="whitespace-nowrap px-4 py-3">{log.actor?.email ?? "System"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{log.branch?.name ?? "-"}</td>
                </tr>
              ))}
            </ResponsiveTable>
          </div>
        </>
      ) : (
        <EmptyState title="No audit logs yet" description="Critical CampusCore changes will appear here." />
      )}
    </div>
  );
}