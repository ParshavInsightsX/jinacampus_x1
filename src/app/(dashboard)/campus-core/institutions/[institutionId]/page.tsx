import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { getInstitutionById } from "@/modules/campus-core/queries";
import { StatusBadge } from "@/components/ui/table-primitives";
import { PermissionState } from "@/components/ui/empty-state";

function value(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  if (value instanceof Date) return value.toLocaleDateString("en-IN");
  return value;
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function InstitutionLogo({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-16 w-16 rounded-xl border border-slate-200 bg-white object-cover shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-50 text-lg font-semibold text-brand-700 ring-1 ring-brand-100">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default async function InstitutionProfilePage({ params }: { params: Promise<{ institutionId: string }> }) {
  const ctx = await requireAuth();
  const { institutionId } = await params;
  const permissions = await getEffectivePermissions({ ctx });
  if (!permissions.has("campuscore.institution.manage")) return <PermissionState />;

  const institution = await getInstitutionById(ctx, institutionId);
  if (!institution) notFound();
  const displayName = institution.displayName ?? institution.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <InstitutionLogo name={displayName} logoUrl={institution.logoUrl} />
          <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">Institution Profile</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-950">{displayName}</h1>
          <p className="mt-1 text-sm text-slate-500">School institution details for {institution.tenant.name}.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/campus-core/institutions" className="premium-secondary-button">
            Back to Institutions
          </Link>
          {permissions.has("campuscore.institution.regulatory.read") ? (
            <Link href={`/campus-core/institutions/${institution.id}/legal-identity`} className="premium-secondary-button">
              Legal Identity &amp; Recognition
            </Link>
          ) : null}
          <Link href={`/campus-core/institutions/${institution.id}/edit`} className="premium-primary-button">
            Edit
          </Link>
        </div>
      </div>

      <section className="premium-card p-5">
        <dl className="grid gap-5 md:grid-cols-3">
          <DetailItem label="Display Name">{value(institution.displayName)}</DetailItem>
          <DetailItem label="Institution Name">{institution.name}</DetailItem>
          <DetailItem label="Code">{institution.code}</DetailItem>
          <DetailItem label="Status"><StatusBadge value={institution.status} /></DetailItem>
          <DetailItem label="Logo">{institution.logoUrl ? "Logo URL configured" : "Using initials fallback"}</DetailItem>
          <DetailItem label="Branches">{institution._count.branches}</DetailItem>
          <DetailItem label="Board">{value(institution.board)}</DetailItem>
          <DetailItem label="Medium">{value(institution.medium)}</DetailItem>
          <DetailItem label="Tenant">{institution.tenant.name}</DetailItem>
          <DetailItem label="Address Line 1">{value(institution.addressLine1)}</DetailItem>
          <DetailItem label="Address Line 2">{value(institution.addressLine2)}</DetailItem>
          <DetailItem label="City">{value(institution.city)}</DetailItem>
          <DetailItem label="State">{value(institution.state)}</DetailItem>
          <DetailItem label="Postal Code">{value(institution.postalCode)}</DetailItem>
          <DetailItem label="Country">{value(institution.country)}</DetailItem>
          <DetailItem label="Created">{value(institution.createdAt)}</DetailItem>
          <DetailItem label="Updated">{value(institution.updatedAt)}</DetailItem>
        </dl>
      </section>
    </div>
  );
}
