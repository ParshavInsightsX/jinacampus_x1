import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { SchoolCastSettingsManager } from "@/modules/schoolcast/components/settings-manager";
import { getSchoolCastSettingsWorkspace } from "@/modules/schoolcast/queries";

export default async function SchoolCastSettingsPage() {
  const ctx = await requireAuth();
  const workspace = await getSchoolCastSettingsWorkspace(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="SchoolCast settings"
        description="Pilot flags, delivery mode, and server-only provider credential references for the active institution."
      />
      <SchoolCastSettingsManager
        features={workspace.features}
        providers={workspace.providers}
        institutionId={workspace.context.institutionId}
        branchId={workspace.context.branchId}
        capabilities={workspace.capabilities}
      />
    </div>
  );
}