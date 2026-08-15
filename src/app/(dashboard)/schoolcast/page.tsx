import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getSchoolCastDashboard } from "@/modules/schoolcast/queries";

export default async function SchoolCastPage() {
  const ctx = await requireAuth();
  const dashboard = await getSchoolCastDashboard(ctx);
  const metrics = [
    ["Drafts", dashboard.metrics.drafts],
    ["Pending approval", dashboard.metrics.pendingApproval],
    ["Published", dashboard.metrics.published],
    ["Homework due", dashboard.metrics.homeworkDue],
    ["Unread", dashboard.metrics.unread],
    ["Queued", dashboard.metrics.queued],
    ["Delivery issues", dashboard.metrics.failed],
  ] as const;

  const actions = [
    dashboard.capabilities.canCreate
      ? { href: "/schoolcast/notices/new", label: "Create notice" }
      : null,
    dashboard.capabilities.canCreateHomework && dashboard.features.homework
      ? { href: "/schoolcast/homework/new", label: "Publish homework" }
      : null,
    dashboard.capabilities.canApprove
      ? { href: "/schoolcast/approvals", label: "Review approvals" }
      : null,
    dashboard.capabilities.canViewDelivery
      ? { href: "/schoolcast/delivery", label: "Check delivery" }
      : null,
    { href: "/notifications", label: "Open notifications" },
  ].filter((item): item is { href: string; label: string } => item !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SchoolCast"
        description={"Communication workspace for " + dashboard.context.branchName + ", " + dashboard.context.academicYearName + "."}
        actionLabel={actions[0]?.label}
        actionHref={actions[0]?.href}
      />

      <section aria-label="SchoolCast summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([label, value]) => (
          <article key={label} className="premium-card p-4">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Recent communications</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recipient details remain masked and are resolved only within the active branch and academic year.
            </p>
          </div>
          {dashboard.recent.length === 0 ? (
            <EmptyState
              title="No SchoolCast communications yet"
              description="Create a notice or homework item when the pilot feature is ready for this institution."
            />
          ) : (
            <div className="space-y-2">
              {dashboard.recent.map((item) => (
                <article key={item.id} className="premium-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-700">
                      {formatEnumLabel(item.type)} / {item._count.recipientSnapshots} recipients
                    </p>
                    <h3 className="mt-1 truncate text-sm font-semibold text-ink">
                      {item.currentVersion?.title ?? "Untitled communication"}
                    </h3>
                    {item.currentVersion?.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.currentVersion.summary}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge value={item.status} />
                    <Link href={"/schoolcast/communications/" + item.id} className="premium-secondary-button min-h-11 px-3">
                      Open
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="premium-card p-5">
            <h2 className="text-sm font-semibold text-ink">Pilot mode</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Delivery</dt>
                <dd className="font-semibold text-slate-700">{dashboard.features.deliveryMode}</dd>
              </div>
              {(["inApp", "email", "whatsApp", "homework", "approvals"] as const).map((feature) => (
                <div key={feature} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{formatEnumLabel(feature)}</dt>
                  <dd className={dashboard.features[feature] ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"}>
                    {dashboard.features[feature] ? "Enabled" : "Off"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="grid gap-2">
            {actions.slice(1).map((action) => (
              <Link key={action.href} href={action.href} className="premium-secondary-button justify-between">
                {action.label}<span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}