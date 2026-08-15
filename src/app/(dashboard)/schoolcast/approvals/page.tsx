import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { listSchoolCastApprovals } from "@/modules/schoolcast/queries";

export default async function SchoolCastApprovalsPage() {
  const ctx = await requireAuth();
  const approvals = await listSchoolCastApprovals(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Communication approvals"
        description="Review immutable submitted versions before publication. Server-side permissions remain authoritative."
      />
      {approvals.length === 0 ? (
        <EmptyState
          title="No approvals are waiting"
          description="Submitted notices and homework will appear here when approval is required."
        />
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => (
            <article key={approval.id} className="premium-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-700">
                  {formatEnumLabel(approval.communication.type)} / {approval.communication._count.audienceRules} audience rules
                </p>
                <h2 className="mt-1 truncate text-sm font-semibold text-ink">
                  {approval.communication.currentVersion?.title ?? "Untitled communication"}
                </h2>
                {approval.communication.currentVersion?.summary ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {approval.communication.currentVersion.summary}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge value={approval.status} />
                <Link
                  href={"/schoolcast/communications/" + approval.communication.id}
                  className="premium-primary-button min-h-11 px-3"
                >
                  Review
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}