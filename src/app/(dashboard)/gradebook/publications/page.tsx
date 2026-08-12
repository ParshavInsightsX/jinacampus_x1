import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookPublicationManager } from "@/modules/gradebook/components/gradebook-publication-manager";
import { getGradebookReportCardWorkspace } from "@/modules/gradebook/queries";

export default async function GradebookPublicationsPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookReportCardWorkspace(ctx);
  return <div className="space-y-6"><PageHeader title="Result Publications" description="Prepare, publish, and revoke recipient-scoped result versions with segregation of duties." /><GradebookPublicationManager capabilities={{ canPrepare: workspace.capabilities.canPreparePublication, canPublish: workspace.capabilities.canPublish, canRevoke: workspace.capabilities.canRevoke }} runs={workspace.approvedRuns.map((run) => ({ id: run.id, examName: run.exam.name, classSectionName: run.examClassSection?.classSection.displayName ?? "Scoped classes", studentCount: run._count.overallResults, reportCardCount: run._count.reportCards }))} publications={workspace.publications.map((publication) => ({ id: publication.id, status: publication.status, audience: publication.audience, examName: publication.exam.name, version: publication.publicationVersion, publishAt: publication.publishAt.toISOString(), publishedAt: publication.publishedAt?.toISOString() ?? null, recipientCount: publication._count.studentPublications }))} /></div>;
}
