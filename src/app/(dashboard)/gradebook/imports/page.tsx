import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { PageHeader, type RouteSearchParams } from "@/modules/academia/components/academia-page-shell";
import { GradebookImportManager } from "@/modules/gradebook/components/gradebook-import-manager";
import { getGradebookImportsWorkspace } from "@/modules/gradebook/queries";

export default async function GradebookImportsPage({ searchParams }: { searchParams?: RouteSearchParams }) {
  const ctx = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const [workspace, permissions] = await Promise.all([
    getGradebookImportsWorkspace(ctx),
    getEffectivePermissions({ ctx, branchId: ctx.activeBranchId, academicYearId: ctx.activeAcademicYearId })
  ]);
  const requestedBatch = typeof params.batchId === "string" ? params.batchId : null;
  const selectedBatchId = workspace.batches.some((batch) => batch.id === requestedBatch) ? requestedBatch : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Marks Imports" description="Private, batch-specific Excel and CSV validation with partial-row reporting and explicit apply." />
      <GradebookImportManager
        selectedBatchId={selectedBatchId}
        capabilities={{ canCreate: permissions.has("gradebook.import.create"), canApply: permissions.has("gradebook.import.apply"), canCancel: permissions.has("gradebook.import.cancel") }}
        batches={workspace.batches.map((batch) => ({ id: batch.id, version: batch.version, status: batch.status, examName: batch.exam.name, classSectionName: batch.examClassSection.classSection.displayName, subjectName: batch.examSubject.subject.name }))}
        jobs={workspace.jobs.map((job) => ({ id: job.id, batchId: job.batch.id, fileName: job.originalFileName, status: job.status, total: job.totalRowCount, valid: job.validRowCount, invalid: job.invalidRowCount, warnings: job.warningRowCount, createdAt: job.createdAt.toISOString() }))}
      />
    </div>
  );
}
