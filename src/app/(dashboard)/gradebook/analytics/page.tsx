import Link from "next/link";

import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getGradebookAnalyticsWorkspace } from "@/modules/gradebook/queries";

function percentage(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

export default async function GradebookAnalyticsPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookAnalyticsWorkspace(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="GradeBook Analytics" description="Privacy-conscious operational summaries calculated only from approved result snapshots in your authorised scope." />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Result analytics summary"><div className="premium-card p-4"><p className="text-xs text-slate-500">Approved runs</p><p className="mt-1 text-2xl font-semibold text-ink">{workspace.metrics.approvedRunCount}</p></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Student outcomes</p><p className="mt-1 text-2xl font-semibold text-ink">{workspace.metrics.totalStudents}</p></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Passed outcomes</p><p className="mt-1 text-2xl font-semibold text-emerald-700">{workspace.metrics.passedStudents}</p></div><div className="premium-card p-4"><p className="text-xs text-slate-500">Pass rate</p><p className="mt-1 text-2xl font-semibold text-ink">{percentage(workspace.metrics.passRate)}</p></div></section>
      <section className="premium-card p-5" aria-labelledby="subject-performance-title"><h2 id="subject-performance-title" className="text-lg font-semibold text-ink">Subject performance</h2><p className="mt-1 text-sm text-slate-500">Average percentage and pass/fail counts across visible approved runs.</p><div className="mt-5 space-y-4">{workspace.subjects.map((subject) => { const average = subject.averagePercentage ?? 0; return <article key={subject.code}><div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">{subject.code} - {subject.name}</h3><p className="mt-1 text-xs text-slate-500">{subject.passed} passed / {subject.failed} failed / {subject.count} scored</p></div><p className="text-sm font-semibold text-ink">{percentage(subject.averagePercentage)}</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, average))}%` }} /></div></article>; })}{workspace.subjects.length === 0 ? <p className="text-sm text-slate-500">No approved subject outcomes are available.</p> : null}</div></section>
      <section className="space-y-4" aria-labelledby="analytics-runs-title"><div><h2 id="analytics-runs-title" className="text-lg font-semibold text-ink">Approved result snapshots</h2><p className="mt-1 text-sm text-slate-500">Open the immutable source run for student-level detail.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workspace.runs.map((run) => <article key={run.id} className="premium-card p-4"><p className="text-xs font-semibold text-slate-500">{run.classSectionName}</p><h3 className="mt-1 font-semibold text-ink">{run.examName}</h3><p className="mt-3 text-xs text-slate-500">{run.studentCount} student outcomes / approved {run.approvedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(run.approvedAt) : "date unavailable"}</p><Link href={`/gradebook/results/${run.id}`} className="premium-secondary-button mt-4 w-full">View result run</Link></article>)}</div></section>
    </div>
  );
}
