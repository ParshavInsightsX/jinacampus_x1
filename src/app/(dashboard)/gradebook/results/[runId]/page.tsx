import Link from "next/link";

import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { StatusBadge } from "@/components/ui/table-primitives";
import { getGradebookResultRunDetail } from "@/modules/gradebook/queries";

function studentName(student: { displayName: string | null; fullName: string | null; firstName: string; lastName: string | null }) {
  return student.displayName ?? student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

export default async function GradebookResultRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const ctx = await requireAuth();
  const { runId } = await params;
  const { run } = await getGradebookResultRunDetail(ctx, runId);
  const subjectsByEnrollment = new Map<string, typeof run.subjectResults>();
  for (const result of run.subjectResults) {
    subjectsByEnrollment.set(result.enrollmentId, [...(subjectsByEnrollment.get(result.enrollmentId) ?? []), result]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><PageHeader title={`${run.exam.name} Results`} description={`${run.examClassSection?.classSection.displayName ?? "Scoped classes"} / ${run.exam.term.name} / engine ${run.engineVersion}`} /><Link href="/gradebook/results" className="premium-secondary-button w-full sm:w-auto">Back to results</Link></div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="premium-card p-4"><p className="text-xs text-slate-500">Run status</p><div className="mt-2"><StatusBadge value={run.status} /></div></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Students</p><p className="mt-1 text-xl font-semibold text-ink">{run.overallResults.length}</p></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Report cards</p><p className="mt-1 text-xl font-semibold text-ink">{run.reportCards.length}</p></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Publications</p><p className="mt-1 text-xl font-semibold text-ink">{run.publications.length}</p></div></section>
      <section className="space-y-3" aria-labelledby="student-results-title"><div><h2 id="student-results-title" className="text-lg font-semibold text-ink">Student outcomes</h2><p className="mt-1 text-sm text-slate-500">Calculated values are read-only. Corrections create replacement versions instead of overwriting this run.</p></div>{run.overallResults.map((overall) => <article key={overall.id} className="premium-card p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-ink">{studentName(overall.enrollment.student)}</h3><p className="mt-1 text-xs text-slate-500">Scholar {overall.enrollment.student.admissionNumber}</p></div><StatusBadge value={overall.resultStatus} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><dt className="text-xs text-slate-500">Marks</dt><dd className="font-semibold text-ink">{overall.totalMarks?.toString() ?? "-"} / {overall.maximumMarks?.toString() ?? "-"}</dd></div><div><dt className="text-xs text-slate-500">Percentage</dt><dd className="font-semibold text-ink">{overall.overallPercentage?.toString() ?? "-"}%</dd></div><div><dt className="text-xs text-slate-500">Grade</dt><dd className="font-semibold text-ink">{overall.overallLetterGrade ?? "-"}</dd></div><div><dt className="text-xs text-slate-500">Subjects passed</dt><dd className="font-semibold text-ink">{overall.passedSubjectCount} / {overall.passedSubjectCount + overall.failedSubjectCount + overall.pendingSubjectCount}</dd></div></dl><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(subjectsByEnrollment.get(overall.enrollmentId) ?? []).map((subject) => <div key={subject.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold text-ink">{subject.examSubject.subject.name}</p><StatusBadge value={subject.resultStatus} /></div><p className="mt-2 text-xs text-slate-500">{subject.rawMarks?.toString() ?? "-"} / {subject.maximumMarks?.toString() ?? "-"} / {subject.percentage?.toString() ?? "-"}% / {subject.letterGrade ?? "-"}</p></div>)}</div></article>)}</section>
    </div>
  );
}
