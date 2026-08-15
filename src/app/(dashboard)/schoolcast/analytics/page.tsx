import { EmptyState } from "@/components/ui/empty-state";
import { formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getSchoolCastAnalytics } from "@/modules/schoolcast/queries";

export default async function SchoolCastAnalyticsPage() {
  const ctx = await requireAuth();
  const analytics = await getSchoolCastAnalytics(ctx);
  const hasData = analytics.communications.length > 0 || analytics.delivery.length > 0;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Communication analytics"
        description="Aggregated communication, delivery, read, and acknowledgement outcomes for the active school scope."
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="premium-card p-5">
          <p className="text-xs font-semibold text-slate-500">Resolved recipients</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{analytics.recipients}</p>
        </article>
        <article className="premium-card p-5">
          <p className="text-xs font-semibold text-slate-500">Acknowledgements</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{analytics.acknowledgements}</p>
        </article>
        <article className="premium-card p-5 sm:col-span-2">
          <p className="text-xs font-semibold text-slate-500">Privacy boundary</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Analytics are aggregate-only. Unmasked contacts and provider payloads are intentionally excluded.
          </p>
        </article>
      </section>
      {!hasData ? (
        <EmptyState
          title="No communication analytics yet"
          description="Aggregates become available after communications are published and delivery processing begins."
        />
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="premium-card p-5">
            <h2 className="text-base font-semibold text-ink">Communication lifecycle</h2>
            <div className="mt-4 space-y-2">
              {analytics.communications.map((row) => (
                <div key={row.type + "-" + row.status} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className="text-slate-600">{formatEnumLabel(row.type)} / {formatEnumLabel(row.status)}</span>
                  <span className="font-semibold tabular-nums text-ink">{row._count._all}</span>
                </div>
              ))}
            </div>
          </article>
          <article className="premium-card p-5">
            <h2 className="text-base font-semibold text-ink">Channel delivery</h2>
            <div className="mt-4 space-y-2">
              {analytics.delivery.map((row) => (
                <div key={row.channel + "-" + row.status} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className="text-slate-600">{formatEnumLabel(row.channel)} / {formatEnumLabel(row.status)}</span>
                  <span className="font-semibold tabular-nums text-ink">{row._count._all}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      )}
    </div>
  );
}