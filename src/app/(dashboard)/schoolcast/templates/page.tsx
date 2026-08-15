import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { SchoolCastTemplateManager } from "@/modules/schoolcast/components/template-manager";
import { getSchoolCastTemplates } from "@/modules/schoolcast/queries";

export default async function SchoolCastTemplatesPage() {
  const ctx = await requireAuth();
  const workspace = await getSchoolCastTemplates(ctx);
  if (!ctx.activeBranchId) {
    return <EmptyState title="Branch context required" description="Select an authorised active branch before managing communication templates." />;
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Communication templates"
        description="Immutable template versions and provider mappings for approved email and WhatsApp messages."
      />
      <SchoolCastTemplateManager
        branchId={ctx.activeBranchId}
        templates={workspace.templates}
        capabilities={workspace.capabilities}
      />
    </div>
  );
}