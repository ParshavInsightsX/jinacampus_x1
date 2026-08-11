import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { EmptyState, PrerequisiteState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getGradebookPublishedReports } from "@/modules/gradebook/queries";

export default async function GradebookReportsPage() {
  const ctx = await requireAuth();
  const assessments = await getGradebookPublishedReports(ctx);

  if (!assessments) {
    return (
      <div className="space-y-6">
        <PageHeader title="Published Results" description="Review published GradeBook assessment summaries." />
        <PrerequisiteState title="GradeBook context unavailable" description="Select an authorised branch and active academic year." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Published Results" description="Published assessment summaries for the active branch and academic year." />
        <Link href="/gradebook" className="premium-secondary-button w-full sm:w-auto">Back to GradeBook</Link>
      </div>
      {assessments.length === 0 ? (
        <EmptyState title="No published results" description="Published assessments will appear here after every active student has a recorded result." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assessments.map((assessment) => {
            const gradedMarks = assessment.marks.filter((mark) => mark.status === "GRADED" && mark.marksObtained !== null);
            const passMarks = Number(assessment.passMarks);
            const maxMarks = Number(assessment.maxMarks);
            const passed = gradedMarks.filter((mark) => Number(mark.marksObtained) >= passMarks).length;
            const absent = assessment.marks.filter((mark) => mark.status === "ABSENT").length;
            const exempt = assessment.marks.filter((mark) => mark.status === "EXEMPT").length;
            const average = gradedMarks.length > 0 && maxMarks > 0
              ? gradedMarks.reduce((sum, mark) => sum + Number(mark.marksObtained), 0) / gradedMarks.length / maxMarks * 100
              : null;

            return (
              <article key={assessment.id} className="premium-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{assessment.classSection.displayName} / {assessment.classSectionSubject.subject.code}</p>
                    <h2 className="mt-1 text-base font-semibold text-ink">{assessment.title}</h2>
                    <p className="mt-1 text-xs text-slate-500">{assessment.code} / {formatEnumLabel(assessment.type)}</p>
                  </div>
                  <StatusBadge value="PUBLISHED" />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-xs text-slate-500">Results</dt><dd className="mt-1 text-lg font-semibold text-ink">{assessment.marks.length}</dd></div>
                  <div><dt className="text-xs text-slate-500">Average</dt><dd className="mt-1 text-lg font-semibold text-ink">{average === null ? "-" : `${average.toFixed(1)}%`}</dd></div>
                  <div><dt className="text-xs text-slate-500">Passed</dt><dd className="mt-1 font-semibold text-emerald-700">{passed}</dd></div>
                  <div><dt className="text-xs text-slate-500">Absent / exempt</dt><dd className="mt-1 font-semibold text-ink">{absent} / {exempt}</dd></div>
                </dl>
                <p className="mt-4 text-xs text-slate-500">
                  Published {assessment.publishedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(assessment.publishedAt) : "date unavailable"}
                </p>
                <Link href={`/gradebook/assessments/${assessment.id}`} className="premium-secondary-button mt-4 w-full">View result ledger</Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
