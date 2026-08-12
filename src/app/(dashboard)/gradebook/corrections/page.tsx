import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookCorrectionsManager } from "@/modules/gradebook/components/gradebook-corrections-manager";
import { getGradebookCorrectionsWorkspace } from "@/modules/gradebook/queries";

function studentName(student: { displayName: string | null; fullName: string | null; firstName: string; lastName: string | null }) {
  return student.displayName ?? student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

export default async function GradebookCorrectionsPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookCorrectionsWorkspace(ctx);
  const targets = [
    ...workspace.markBatches.map((batch) => ({ id: batch.id, examId: batch.examId, type: "MARK_BATCH" as const, label: `${batch.exam.name} / ${batch.examClassSection.classSection.displayName} / ${batch.examSubject.subject.name} / ${batch.status}` })),
    ...workspace.resultRuns.map((run) => ({ id: run.id, examId: run.examId, type: "RESULT_RUN" as const, label: `${run.exam.name} / ${run.examClassSection?.classSection.displayName ?? "Scoped classes"} / ${run.status}` })),
    ...workspace.reportCards.map((card) => ({ id: card.id, examId: card.resultRun.examId, type: "REPORT_CARD" as const, label: `${card.resultRun.exam.name} / ${studentName(card.student)} / ${card.status}` }))
  ];
  return <div className="space-y-6"><PageHeader title="GradeBook Corrections" description="Controlled reopen, result correction, adjustment, replacement, and closure workflows." /><GradebookCorrectionsManager capabilities={workspace.capabilities} targets={targets} subjectResults={workspace.subjectResults.flatMap((result) => result.rawMarks !== null && result.maximumMarks !== null ? [{ id: result.id, label: `${result.resultRun.exam.name} / ${studentName(result.enrollment.student)} / ${result.examSubject.subject.name}`, rawMarks: result.rawMarks.toString(), maximumMarks: result.maximumMarks.toString() }] : [])} corrections={workspace.corrections.map((item) => ({ id: item.id, examName: item.exam.name, requestType: item.requestType, targetType: item.targetType, status: item.status, reason: item.reason, requestedAt: item.requestedAt.toISOString(), approvedUntil: item.approvedUntil?.toISOString() ?? null }))} adjustments={workspace.adjustments.map((item) => ({ id: item.id, type: item.adjustmentType, status: item.status, reason: item.reason, proposedValue: item.proposedValue?.toString() ?? null, proposedDelta: item.proposedDelta?.toString() ?? null, createdAt: item.createdAt.toISOString() }))} /></div>;
}
