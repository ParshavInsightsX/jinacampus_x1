import { EmptyState } from "@/components/ui/empty-state";
import { ResponsiveTable, StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { DeliveryRetryControl } from "@/modules/schoolcast/components/delivery-retry-control";
import { WorkerEventRetryControl } from "@/modules/schoolcast/components/worker-event-retry-control";
import { getSchoolCastDelivery } from "@/modules/schoolcast/queries";

export default async function SchoolCastDeliveryPage() {
  const ctx = await requireAuth();
  const workspace = await getSchoolCastDelivery(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Delivery operations"
        description="Masked recipient-channel status, retries, and failures. Provider payloads and credentials are never rendered."
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {workspace.summary.map((entry) => (
          <article key={entry.channel + "-" + entry.status + "-" + entry.mode} className="premium-card p-4">
            <p className="text-xs font-semibold text-slate-500">
              {formatEnumLabel(entry.channel)} / {formatEnumLabel(entry.mode)}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{entry._count._all}</p>
            <div className="mt-2"><StatusBadge value={entry.status} /></div>
          </article>
        ))}
      </section>
      {workspace.recent.length === 0 ? (
        <EmptyState
          title="No SchoolCast deliveries"
          description="External channel rows appear only after an approved communication is published."
        />
      ) : (
        <ResponsiveTable
          columns={["Communication", "Recipient", "Channel", "Mode", "Status", "Attempts", "Scheduled", ...(workspace.capabilities.canRetry ? ["Operations"] : [])]}
          caption="SchoolCast delivery operations"
          minWidthClass="min-w-[980px]"
        >
          {workspace.recent.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-semibold text-ink">{row.communicationVersion?.title ?? "Communication"}</td>
              <td className="px-4 py-3">
                <span>{row.recipientSnapshot?.displayName ?? formatEnumLabel(row.recipientSnapshot?.recipientType)}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {row.recipientSnapshot?.contactEmailMasked ?? row.recipientSnapshot?.contactPhoneMasked ?? "Contact unavailable"}
                </span>
              </td>
              <td className="px-4 py-3">{formatEnumLabel(row.channel)}</td>
              <td className="px-4 py-3">{formatEnumLabel(row.mode)}</td>
              <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
              <td className="px-4 py-3 tabular-nums">{row.attemptCount}/{row.maxAttempts}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(row.scheduledFor)}
              </td>
              {workspace.capabilities.canRetry ? (
                <td className="px-4 py-3 align-top">
                  {row.status === "FAILED" || row.status === "UNDELIVERABLE" ? (
                    <DeliveryRetryControl outboxId={row.id} />
                  ) : (
                    <span className="text-xs text-slate-400">No action required</span>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </ResponsiveTable>
      )}
      {workspace.capabilities.canReconcile ? (
        <section className="space-y-3" aria-labelledby="integration-failures-heading">
          <div>
            <h2 id="integration-failures-heading" className="text-lg font-semibold text-ink">Integration failure ledger</h2>
            <p className="mt-1 text-sm text-slate-500">Terminal source events are scoped to the active branch and academic year. Retry only after the recorded cause is resolved.</p>
          </div>
          {workspace.integrationFailures.length === 0 ? (
            <EmptyState title="No terminal integration failures" description="Attendance, leave, calendar, and GradeBook integration workers have no events requiring reconciliation." />
          ) : (
            <ResponsiveTable
              columns={["Source", "Event", "Attempts", "Error", "Created", "Operation"]}
              caption="SchoolCast source integration failures"
              minWidthClass="min-w-[900px]"
            >
              {workspace.integrationFailures.map((event) => (
                <tr key={`${event.kind}-${event.id}`}>
                  <td className="px-4 py-3 font-semibold text-ink">{formatEnumLabel(event.source)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{event.eventType}</td>
                  <td className="px-4 py-3 tabular-nums">{event.attemptCount}</td>
                  <td className="px-4 py-3 text-xs text-rose-700">{event.errorCode ?? "Failure recorded"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(event.createdAt)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <WorkerEventRetryControl eventId={event.id} kind={event.kind} />
                  </td>
                </tr>
              ))}
            </ResponsiveTable>
          )}
        </section>
      ) : null}
    </div>
  );
}