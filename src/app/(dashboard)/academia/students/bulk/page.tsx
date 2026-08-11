import Link from "next/link";
import { PermissionState, PrerequisiteState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listAccessibleBranches } from "@/modules/campus-core/queries";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { StudentBulkManager } from "@/modules/academia/components/student-bulk-manager";

export default async function StudentBulkPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("academia.student.view")) return <PermissionState />;
  const branches = await listAccessibleBranches(ctx);
  if (!branches.length) {
    return <PrerequisiteState title="No branch access" description="Branch access is required before importing or exporting student records." />;
  }
  const canImport = permissions.has("academia.student.create") &&
    permissions.has("academia.guardian.manage") &&
    permissions.has("academia.enrollment.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Import & Export"
        description="Import essential student records with a simple Excel or Google Sheets-compatible template."
      />
      <div className="flex justify-end">
        <Link href="/academia/students" className="premium-secondary-button">Back to students</Link>
      </div>
      <StudentBulkManager
        branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        defaultBranchId={ctx.activeBranchId ?? branches[0]?.id}
        canImport={canImport}
      />
    </div>
  );
}
