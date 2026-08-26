import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, PermissionState, PrerequisiteState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getSafeErrorCode } from "@/lib/errors";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { InstitutionRegulatoryProfileManager } from "@/modules/campus-core/regulatory/components/regulatory-profile-manager";
import { getInstitutionRegulatoryWorkspace } from "@/modules/campus-core/regulatory/queries";

export default async function InstitutionLegalIdentityPage({
  params
}: {
  params: Promise<{ institutionId: string }>;
}) {
  const ctx = await requireAuth();
  const { institutionId } = await params;
  const permissions = await getEffectivePermissions({ ctx });
  if (!permissions.has("campuscore.institution.regulatory.read")) return <PermissionState />;

  try {
    const workspace = await getInstitutionRegulatoryWorkspace(ctx, institutionId);
    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-brand-700">Institution Governance</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Legal Identity &amp; Recognition</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Maintain the institution&apos;s legal name, managing body, official codes, recognition,
              affiliations, and private supporting evidence.
            </p>
          </div>
          <Link
            href={`/campus-core/institutions/${institutionId}`}
            className="premium-secondary-button w-full sm:w-auto"
          >
            Back to Institution
          </Link>
        </header>
        <InstitutionRegulatoryProfileManager workspace={workspace} />
      </div>
    );
  } catch (error) {
    const code = getSafeErrorCode(error);
    if (code === "INSTITUTION_REGULATORY_UPGRADE_REQUIRED") {
      return (
        <PrerequisiteState
          title="Legal identity setup is not available yet"
          description="The approved additive database upgrade must be applied before this workspace can be used. Existing institution workflows remain available."
        />
      );
    }
    if (code === "INSTITUTION_NOT_FOUND") notFound();
    return (
      <ErrorState
        title="Legal identity details could not be loaded"
        description="No data was changed. Please retry or ask an administrator to review the institution setup."
      />
    );
  }
}
