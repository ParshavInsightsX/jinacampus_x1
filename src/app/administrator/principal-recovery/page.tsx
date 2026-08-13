import { PermissionState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/table-primitives";
import { requireAdministratorContext } from "@/modules/campus-core/administrator-auth";
import { AdministratorShell } from "@/modules/campus-core/components/administrator-shell";
import { PrincipalRecoveryActions } from "@/modules/campus-core/components/principal-recovery-actions";
import { getPrincipalPasswordRecoveryRequests } from "@/modules/campus-core/principal-password-recovery.service";

function formatDateTime(value: Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function principalName(user: {
  displayName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" ");
}

export default async function PrincipalRecoveryPage() {
  const ctx = await requireAdministratorContext();
  if (!ctx.canManagePrincipalRecovery) {
    return (
      <AdministratorShell ctx={ctx}>
        <PermissionState
          title="Principal recovery access required"
          description="Only a specifically authorised JinaCampus platform administrator can review Principal credential recovery."
        />
      </AdministratorShell>
    );
  }

  const requests = await getPrincipalPasswordRecoveryRequests(ctx);
  const pending = requests.filter((request) => request.status === "PENDING");
  const reviewed = requests.filter((request) => request.status !== "PENDING");

  return (
    <AdministratorShell ctx={ctx} activeHref="/administrator/principal-recovery">
      <section className="premium-section-shell">
        <p className="premium-muted-chip">Credential Governance</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-950">Principal Password Recovery</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Verify the Principal identity and institution before approving a single-use reset link or temporary password.
          Existing passwords are never displayed or recoverable.
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="pending-principal-recovery">
        <div>
          <h3 id="pending-principal-recovery" className="text-xl font-semibold text-slate-950">
            Pending requests
          </h3>
          <p className="mt-1 text-sm text-slate-500">{pending.length} request{pending.length === 1 ? "" : "s"} awaiting review.</p>
        </div>
        {pending.length ? pending.map((request) => (
          <article key={request.id} className="premium-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={request.status} />
                  <span className="premium-muted-chip">
                    Requested by {request.identifierType === "EMAIL" ? "registered email" : "Principal ID"}
                  </span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-slate-950">{principalName(request.principalUser)}</h4>
                <p className="mt-1 text-sm font-semibold text-brand-700">
                  Principal ID: {request.principalUser.principalId ?? "Not assigned"}
                </p>
                <p className="mt-1 text-sm text-slate-600">{request.principalUser.email}</p>
                {request.principalUser.phone ? <p className="mt-1 text-sm text-slate-600">{request.principalUser.phone}</p> : null}
              </div>
              <div className="text-left text-sm text-slate-600 sm:text-right">
                <p className="font-semibold text-slate-900">{request.institution.displayName ?? request.institution.name}</p>
                <p className="mt-1">School ID: {request.tenant.slug}</p>
                <p className="mt-1">Requested {formatDateTime(request.createdAt)}</p>
              </div>
            </div>
            <PrincipalRecoveryActions requestId={request.id} />
          </article>
        )) : (
          <div className="premium-card p-6 text-sm text-slate-600">
            No Principal recovery requests are waiting for review.
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="reviewed-principal-recovery">
        <div>
          <h3 id="reviewed-principal-recovery" className="text-xl font-semibold text-slate-950">Review history</h3>
          <p className="mt-1 text-sm text-slate-500">Recent approved, completed, rejected, and expired requests.</p>
        </div>
        <div className="premium-card overflow-hidden">
          {reviewed.length ? (
            <div className="divide-y divide-slate-200">
              {reviewed.map((request) => (
                <div key={request.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-950">{principalName(request.principalUser)}</p>
                      <StatusBadge value={request.status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {request.institution.displayName ?? request.institution.name} · School ID: {request.tenant.slug}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Method: {request.resetMethod?.replaceAll("_", " ") ?? "Not issued"} · Delivery: {request.notificationStatus.replaceAll("_", " ")}
                      {request.reviewRemarks ? ` · Notes: ${request.reviewRemarks}` : ""}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">{formatDateTime(request.reviewedAt ?? request.createdAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-5 text-sm text-slate-600">No reviewed requests yet.</p>
          )}
        </div>
      </section>
    </AdministratorShell>
  );
}
