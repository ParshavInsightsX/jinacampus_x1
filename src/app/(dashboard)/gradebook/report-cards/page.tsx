import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader, type RouteSearchParams } from "@/modules/academia/components/academia-page-shell";
import { GradebookReportCardManager } from "@/modules/gradebook/components/gradebook-report-card-manager";
import { getGradebookReportCardWorkspace } from "@/modules/gradebook/queries";

function studentName(student: { displayName: string | null; fullName: string | null; firstName: string; lastName: string | null }) {
  return student.displayName ?? student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

export default async function GradebookReportCardsPage({ searchParams }: { searchParams?: RouteSearchParams }) {
  const ctx = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const workspace = await getGradebookReportCardWorkspace(ctx);
  const requestedRun = typeof params.resultRunId === "string" ? params.resultRunId : null;
  return <div className="space-y-6"><PageHeader title="GradeBook Report Cards" description="Versioned templates, immutable snapshots, private PDFs, independent approval, and controlled publication." /><GradebookReportCardManager selectedResultRunId={workspace.approvedRuns.some((run) => run.id === requestedRun) ? requestedRun : null} capabilities={{ canManageTemplates: workspace.capabilities.canManageTemplates, canGenerate: workspace.capabilities.canGenerate, canApprove: workspace.capabilities.canApprove }} templates={workspace.templates.map((template) => ({ id: template.id, code: template.code, name: template.name, status: template.status, versions: template.versions.map((version) => ({ id: version.id, versionNumber: version.versionNumber, status: version.status })) }))} runs={workspace.approvedRuns.map((run) => ({ id: run.id, examName: run.exam.name, classSectionName: run.examClassSection?.classSection.displayName ?? "Scoped classes", studentCount: run._count.overallResults, reportCardCount: run._count.reportCards }))} cards={workspace.cards.map((card) => ({ id: card.id, status: card.status, version: card.version, studentName: studentName(card.student), scholarNumber: card.student.admissionNumber, examName: card.resultRun.exam.name, createdAt: card.createdAt.toISOString() }))} /></div>;
}
