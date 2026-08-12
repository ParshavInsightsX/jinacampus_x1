import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookWorkflowQueue } from "@/modules/gradebook/components/gradebook-workflow-queue";
import { getGradebookWorkflowQueue } from "@/modules/gradebook/queries";

function name(user: { displayName: string | null; firstName: string; lastName: string | null; email: string }) {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

export default async function GradebookApprovalsPage() {
  const ctx = await requireAuth();
  const batches = await getGradebookWorkflowQueue(ctx, "APPROVALS");
  return <div className="space-y-6"><PageHeader title="Marks Approvals" description="Final academic approval queue with enforced separation from submission and verification actors." /><GradebookWorkflowQueue mode="APPROVALS" batches={batches.map((batch) => ({ id: batch.id, version: batch.version, status: batch.status, examName: batch.exam.name, classSectionName: batch.examClassSection.classSection.displayName, subjectName: batch.examSubject.subject.name, teacherName: name(batch.teacherAssignment.teacherUser), updatedAt: batch.updatedAt.toISOString() }))} /></div>;
}
