import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { getMyStaffLeaveWorkspace } from "@/modules/staffboard-lite/queries";
import { StatusBadge } from "@/components/ui/table-primitives";

function fullName(person: { firstName: string; middleName?: string | null; lastName?: string | null }) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}
export default async function StaffLeavePage() {
  const ctx = await requireAuth();
  const workspace = await getMyStaffLeaveWorkspace(ctx);
  const permissions = await getEffectivePermissions({ ctx, branchId: workspace.staff.branchId });

  return (
    <div className="space-y-6">
      <PageHeader title="My Leave" description={`Leave applications and balances for ${fullName(workspace.staff)} (${workspace.staff.employeeCode}).`} />

      <div className="flex flex-wrap gap-2">
        {permissions.has("staffboard.leave.self_apply") && workspace.leaveTypes.length ? <Link href="/staffboard/leave/apply" className="premium-primary-button min-h-11">Apply for leave</Link> : null}
        {permissions.has("staffboard.leave.view") ? <Link href="/staffboard/leave/review" className="premium-secondary-button min-h-11">Review applications</Link> : null}
        {permissions.has("staffboard.leave.settings.manage") ? <Link href="/staffboard/leave/settings" className="premium-secondary-button min-h-11">Leave settings</Link> : null}
      </div>

      {!workspace.leaveTypes.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Leave types have not been configured for this branch. Ask the Principal to complete Leave Settings before applying.
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{workspace.year} balances</h2>
          <span className="text-xs text-slate-500">Approved applications consume tracked balance.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {workspace.balances.map((balance) => (
            <div key={balance.leaveTypeId} className="premium-card p-4">
              <p className="text-sm font-semibold text-slate-700">{balance.name}</p>
              {balance.balanceTracked ? (
                <><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{balance.available}</p><p className="mt-1 text-xs text-slate-500">Available · {Number(balance.used)} used</p></>
              ) : <p className="mt-2 text-sm text-slate-500">Untracked / unpaid leave</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-950">Application history</h2>
        {workspace.applications.length ? workspace.applications.map((application) => (
          <Link key={application.id} href={`/staffboard/leave/${application.id}`} className="premium-card block p-4 transition hover:border-brand-200 hover:shadow-elevated premium-focus">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="font-semibold text-slate-950">{application.leaveType.name}</p><p className="mt-1 text-sm text-slate-500">{application.startDate.toISOString().slice(0, 10)} to {application.endDate.toISOString().slice(0, 10)} · {application.totalDays.toNumber()} day(s)</p></div>
              <StatusBadge value={application.status} />
            </div>
            <p className="mt-3 line-clamp-2 text-sm text-slate-600">{application.reason}</p>
          </Link>
        )) : <p className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">No leave applications for {workspace.year}.</p>}
      </section>
    </div>
  );
}
