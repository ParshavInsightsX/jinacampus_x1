import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookResultsManager } from "@/modules/gradebook/components/gradebook-results-manager";
import { getGradebookResultsWorkspace } from "@/modules/gradebook/queries";

export default async function GradebookResultsPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookResultsWorkspace(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="GradeBook Results" description="Deterministic, immutable calculation runs built only from approved marks and active policy versions." />
      <GradebookResultsManager
        capabilities={workspace.capabilities}
        exams={workspace.exams.map((exam) => ({ id: exam.id, name: exam.name, status: exam.status, classSections: exam.classSections.map((item) => ({ id: item.id, name: item.classSection.displayName })) }))}
        runs={workspace.resultRuns.map((run) => ({ id: run.id, status: run.status, examName: run.exam.name, classSectionName: run.examClassSection?.classSection.displayName ?? "Scoped classes", createdAt: run.createdAt.toISOString(), subjectCount: run._count.subjectResults, studentCount: run._count.overallResults, reportCardCount: run._count.reportCards }))}
      />
    </div>
  );
}
