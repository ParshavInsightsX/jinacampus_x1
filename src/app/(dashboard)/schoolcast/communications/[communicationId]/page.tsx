import Link from "next/link";

import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { CommunicationActions } from "@/modules/schoolcast/components/communication-actions";
import { SchoolCastAttachmentPanel } from "@/modules/schoolcast/components/schoolcast-attachment-panel";
import { getSchoolCastCommunication } from "@/modules/schoolcast/queries";

export default async function SchoolCastCommunicationDetailPage({
  params,
}: {
  params: Promise<{ communicationId: string }>;
}) {
  const ctx = await requireAuth();
  const { communicationId } = await params;
  const { communication, capabilities } = await getSchoolCastCommunication(
    ctx,
    communicationId,
  );
  const version = communication.currentVersion;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={version?.title ?? "Communication"}
          description={formatEnumLabel(communication.type) + " / immutable version " + (version?.versionNo ?? 0)}
        />
        <Link href="/schoolcast/communications" className="premium-secondary-button w-full sm:w-auto">
          Back to communications
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <article className="premium-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={communication.status} />
            <StatusBadge value={communication.priority} />
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {communication.category}
            </span>
          </div>
          {version?.summary ? (
            <p className="mt-4 text-sm font-medium leading-6 text-slate-700">{version.summary}</p>
          ) : null}
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {version?.contentText}
          </div>
        </article>

        <aside className="space-y-4">
          <section className="premium-card p-5">
            <h2 className="text-sm font-semibold text-ink">Governance summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Recipients</dt>
                <dd className="font-semibold tabular-nums text-slate-700">{communication._count.recipientSnapshots}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Queued deliveries</dt>
                <dd className="font-semibold tabular-nums text-slate-700">{communication._count.outboxItems}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Acknowledgements</dt>
                <dd className="font-semibold tabular-nums text-slate-700">{communication._count.acknowledgements}</dd>
              </div>
            </dl>
          </section>
          <section className="premium-card p-5">
            <h2 className="text-sm font-semibold text-ink">Channels</h2>
            <div className="mt-3 space-y-2">
              {communication.channelPlans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <span className="font-semibold text-slate-700">{formatEnumLabel(plan.channel)}</span>
                  <StatusBadge value={plan.status} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      {capabilities.attachmentsAvailable ? <SchoolCastAttachmentPanel
        communicationId={communication.id}
        attachments={communication.attachments}
        canUpload={capabilities.canUpload && ["DRAFT", "REJECTED"].includes(communication.status)}
        maxBytes={env.SCHOOLCAST_ATTACHMENT_MAX_BYTES}
      /> : null}

      <CommunicationActions
        communicationId={communication.id}
        status={communication.status}
        capabilities={capabilities}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="premium-card p-5">
          <h2 className="text-base font-semibold text-ink">Audience rules</h2>
          <div className="mt-3 space-y-2">
            {communication.audienceRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <span className="font-semibold text-slate-700">
                  {formatEnumLabel(rule.mode)} {formatEnumLabel(rule.ruleType)}
                </span>
                {rule.label ? <p className="mt-1 text-xs text-slate-500">{rule.label}</p> : null}
              </div>
            ))}
          </div>
        </article>
        <article className="premium-card p-5">
          <h2 className="text-base font-semibold text-ink">Version and approval history</h2>
          <div className="mt-3 space-y-3">
            {communication.versions.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-700">Version {entry.versionNo}: {entry.title}</p>
                <p className="mt-1 text-xs text-slate-400">Content hash retained for audit integrity.</p>
              </div>
            ))}
            {communication.approvals.flatMap((approval) => approval.actions).map((action, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-700">{formatEnumLabel(action.action)}</p>
                {action.reason ? <p className="mt-1 text-xs text-slate-500">{action.reason}</p> : null}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}