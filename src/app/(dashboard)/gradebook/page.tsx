import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookWorkspace } from "@/modules/gradebook/components/gradebook-workspace";
import { getGradebookMvpDashboard, getGradebookWorkspace } from "@/modules/gradebook/queries";

function userName(user: { displayName: string | null; firstName: string; lastName: string | null; email: string } | null) {
  if (!user) return null;
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

function completion(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const entered = typeof row.entered === "number" ? row.entered : null;
  const total = typeof row.total === "number" ? row.total : null;
  return entered !== null && total !== null ? `${entered}/${total}` : null;
}

export default async function GradebookPage() {
  const ctx = await requireAuth();
  const [dashboard, legacyWorkspace] = await Promise.all([
    getGradebookMvpDashboard(ctx),
    getGradebookWorkspace(ctx)
  ]);

  const metrics = [
    { label: "Examinations", value: dashboard.metrics.examCount, detail: `${dashboard.metrics.activeExamCount} active workflow` },
    { label: "Marks batches", value: dashboard.metrics.assignedBatchCount, detail: `${dashboard.metrics.pendingBatchCount} require action` },
    { label: "Approved runs", value: dashboard.metrics.approvedRunCount, detail: `${dashboard.metrics.pendingResultRunCount} awaiting approval` },
    { label: "Published results", value: dashboard.metrics.publishedResultCount, detail: `${dashboard.metrics.pendingCorrectionCount} open corrections` }
  ];

  const primaryActions = [
    dashboard.capabilities.canConfigure ? { href: "/gradebook/setup", label: "Configure GradeBook" } : null,
    dashboard.capabilities.canCreateExam ? { href: "/gradebook/exams", label: "Create examination" } : null,
    { href: "/gradebook/marks", label: "Open marks work queue" },
    dashboard.capabilities.canCalculateResults ? { href: "/gradebook/results", label: "Review result runs" } : null,
    dashboard.capabilities.canGenerateReportCards ? { href: "/gradebook/report-cards", label: "Generate report cards" } : null,
    dashboard.capabilities.canViewAnalytics ? { href: "/gradebook/analytics", label: "View approved analytics" } : null
  ].filter((action): action is { href: string; label: string } => action !== null);

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="GradeBook"
          description={`Academic results workspace for ${dashboard.context.branchName}, ${dashboard.context.academicYearName}.`}
        />
        <div className="flex flex-wrap gap-2">
          {primaryActions.slice(0, 2).map((action) => (
            <Link key={action.href} href={action.href} className="premium-secondary-button w-full sm:w-auto">
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <section aria-label="GradeBook workflow summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="premium-card p-5">
            <p className="text-xs font-semibold text-slate-500">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{metric.value}</p>
            <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Current marks work</h2>
            <p className="mt-1 text-sm text-slate-500">Only assigned or permission-scoped class and subject batches are shown.</p>
          </div>
          {dashboard.recentBatches.length === 0 ? (
            <EmptyState title="No marks batches yet" description="Activate an examination and assign its class-subject scopes to prepare marks entry." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {dashboard.recentBatches.map((batch) => (
                <article key={batch.id} className="premium-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-500">{batch.examClassSection.classSection.displayName}</p>
                      <h3 className="mt-1 text-sm font-semibold text-ink">{batch.exam.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{batch.examSubject.subject.code} / {batch.examSubject.subject.name}</p>
                    </div>
                    <StatusBadge value={batch.status} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>Completion {completion(batch.completionCountsJson) ?? "not started"}</span>
                    <Link href={`/gradebook/marks/${batch.id}`} className="font-semibold text-brand hover:underline">Open</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="premium-card p-5">
            <h2 className="text-sm font-semibold text-ink">Pilot controls</h2>
            <div className="mt-4 space-y-2 text-sm">
              {Object.entries(dashboard.features).map(([feature, enabled]) => (
                <div key={feature} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                  <span className="text-slate-600">{formatEnumLabel(feature)}</span>
                  <span className={enabled ? "font-semibold text-emerald-700" : "font-semibold text-slate-400"}>{enabled ? "Enabled" : "Off"}</span>
                </div>
              ))}
            </div>
          </section>
          {dashboard.metrics.failedJobCount > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
              {dashboard.metrics.failedJobCount} GradeBook job{dashboard.metrics.failedJobCount === 1 ? "" : "s"} need operational review.
            </div>
          ) : null}
          <div className="grid gap-2">
            {primaryActions.slice(2).map((action) => (
              <Link key={action.href} href={action.href} className="premium-secondary-button justify-between">
                {action.label}<span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </aside>
      </section>

      {legacyWorkspace ? (
        <section className="space-y-4 border-t border-slate-200 pt-7">
          <div>
            <h2 className="text-lg font-semibold text-ink">Assessment ledger</h2>
            <p className="mt-1 text-sm text-slate-500">Existing assessment records remain available during the controlled GradeBook rollout.</p>
          </div>
          <GradebookWorkspace
            branchName={legacyWorkspace.branch.name}
            academicYearName={legacyWorkspace.academicYear.name}
            capabilities={legacyWorkspace.capabilities}
            classSections={legacyWorkspace.classSections.map(({ id, displayName }) => ({ id, displayName }))}
            subjects={legacyWorkspace.subjects}
            teachers={legacyWorkspace.teachers.map((teacher) => ({ id: teacher.id, name: userName(teacher) ?? teacher.email, email: teacher.email }))}
            assignments={legacyWorkspace.assignments.map((assignment) => ({
              id: assignment.id,
              classSectionId: assignment.classSectionId,
              classSectionName: assignment.classSection.displayName,
              subjectCode: assignment.subject.code,
              subjectName: assignment.subject.name,
              teacherUserId: assignment.teacherUserId,
              teacherName: userName(assignment.teacherUser),
              status: assignment.status,
              assessmentCount: assignment._count.assessments
            }))}
            assessments={legacyWorkspace.assessments.map((assessment) => ({
              id: assessment.id,
              code: assessment.code,
              title: assessment.title,
              type: assessment.type,
              assessmentDate: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(assessment.assessmentDate),
              maxMarks: assessment.maxMarks.toString(),
              passMarks: assessment.passMarks.toString(),
              status: assessment.status,
              publishedAt: assessment.publishedAt?.toISOString() ?? null,
              classSectionName: assessment.classSection.displayName,
              subjectCode: assessment.classSectionSubject.subject.code,
              subjectName: assessment.classSectionSubject.subject.name,
              markCount: assessment._count.marks
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
