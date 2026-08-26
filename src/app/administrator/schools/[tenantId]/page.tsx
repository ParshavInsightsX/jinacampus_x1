import Link from "next/link";
import { notFound } from "next/navigation";
import { PermissionState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/table-primitives";
import { InstitutionLogo } from "@/components/brand/institution-logo";
import { AppError } from "@/lib/errors";
import { requireAdministratorContext } from "@/modules/campus-core/administrator-auth";
import { getSchoolByIdForAdministrator } from "@/modules/campus-core/administrator-services";
import { AdministratorShell } from "@/modules/campus-core/components/administrator-shell";
import { SchoolLifecycleActions } from "@/modules/campus-core/components/administrator-school-forms";

type PageParams = Promise<{ tenantId: string }>;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-950">{value ?? "Not set"}</p>
    </div>
  );
}

function isNextNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).includes("NEXT_NOT_FOUND");
}

export default async function AdministratorSchoolDetailPage({ params }: { params: PageParams }) {
  const ctx = await requireAdministratorContext();
  const { tenantId } = await params;

  try {
    const school = await getSchoolByIdForAdministrator(ctx, tenantId);
    if (!school) notFound();
    const dependencies = Object.entries(school.dependencySummary);

    return (
      <AdministratorShell ctx={ctx} activeHref="/administrator/schools">
        <section className="premium-section-shell">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="premium-muted-chip">School Detail</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{school.name}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StatusBadge value={school.status} />
                <span className="premium-muted-chip">School ID: {school.slug}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:flex sm:items-center">
              <Link href={`/administrator/schools/${school.id}/edit`} className="premium-secondary-button w-full premium-focus sm:w-auto">
                Edit School
              </Link>
            </div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoRow label="Support Email" value={school.supportEmail} />
          <InfoRow label="Legal Name" value={school.legalName} />
          <InfoRow label="Subscription Plan" value={school.commercialAccessSchemaAvailable ? school.subscription?.planCode ?? "Not configured" : "Database update required"} />
          <InfoRow label="Subscription Status" value={school.commercialAccessSchemaAvailable ? school.subscription?.status ?? "Not configured" : "Setup pending"} />
          <InfoRow label="Created" value={formatDate(school.createdAt)} />
          <InfoRow label="Updated" value={formatDate(school.updatedAt)} />
        </section>
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="premium-card p-5">
            <h3 className="text-lg font-semibold text-slate-950">Institution and Branches</h3>
            <div className="mt-4 space-y-3">
              {school.institutions.map((institution) => (
                <div key={institution.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/75 p-4">
                  <InstitutionLogo
                    name={institution.displayName ?? institution.name}
                    logoUrl={institution.logoUrl}
                    className="h-12 w-12"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950" title={institution.displayName ?? institution.name}>
                      {institution.displayName ?? institution.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">Code: {institution.code} · Status: {institution.status}</p>
                    <p className="mt-1 text-sm text-slate-500">Logo: {institution.logoUrl ? "Configured" : "Fallback initials"}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Attendance: {school.commercialAccessSchemaAvailable ? institution.entitlements.find((entry) => entry.moduleKey === "attendance" && entry.featureKey === "module")?.access ?? "Not configured" : "Setup pending"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      GradeBook: {school.commercialAccessSchemaAvailable ? institution.entitlements.find((entry) => entry.moduleKey === "gradebook" && entry.featureKey === "module")?.access ?? "Not configured" : "Setup pending"}
                    </p>
                  </div>
                </div>
              ))}
              {school.branches.map((branch) => (
                <div key={branch.id} className="rounded-2xl border border-slate-200 bg-white/75 p-4">
                  <p className="font-semibold text-slate-950">{branch.name}</p>
                  <p className="mt-1 text-sm text-slate-500">Code: {branch.code} · Status: {branch.status}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="premium-card p-5">
            <h3 className="text-lg font-semibold text-slate-950">Administrators and Principals</h3>
            <div className="mt-4 space-y-3">
              {school.users.length ? school.users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-slate-200 bg-white/75 p-4">
                  <p className="font-semibold text-slate-950">{user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" ")}</p>
                  <p className="mt-1 text-sm font-semibold text-brand-700">Principal ID: {user.principalId ?? "Not assigned"}</p>
                  <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                  <p className="mt-1 text-sm text-slate-500">Status: {user.status}</p>
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No principal or admin users found.</p>
              )}
            </div>
          </div>
        </section>
        <section className="premium-card p-5">
          <h3 className="text-lg font-semibold text-slate-950">Dependency Summary</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Counts are shown for deletion review. Confirmed permanent deletion removes these tenant-owned records atomically and retains a separate platform audit entry.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {dependencies.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label.replace(/([A-Z])/g, " $1")}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </section>
        <SchoolLifecycleActions school={{ id: school.id, name: school.name, status: school.status }} />
      </AdministratorShell>
    );
  } catch (error) {
    if (isNextNotFound(error)) throw error;
    if (!(error instanceof AppError) || error.status !== 403) throw error;
    return (
      <AdministratorShell ctx={ctx} activeHref="/administrator/schools">
        <PermissionState
          title="School detail unavailable"
          description="Your administrator account does not have permission to view this school."
        />
      </AdministratorShell>
    );
  }
}
