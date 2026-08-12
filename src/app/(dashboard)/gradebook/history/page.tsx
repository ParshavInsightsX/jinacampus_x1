import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { StatusBadge } from "@/components/ui/table-primitives";
import { getGradebookHistoryWorkspace } from "@/modules/gradebook/queries";

export default async function GradebookHistoryPage() {
  const ctx = await requireAuth();
  const publications = await getGradebookHistoryWorkspace(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="GradeBook History" description="Published academic-result versions retained for authorised historical review and reprint workflows." />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Published GradeBook history">
        {publications.map((publication) => <article key={publication.id} className="premium-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{publication.exam.term.name} / version {publication.publicationVersion}</p><h2 className="mt-1 font-semibold text-ink">{publication.exam.name}</h2></div><StatusBadge value={publication.status} /></div><p className="mt-3 text-sm text-slate-600">{publication.resultRun.examClassSection?.classSection.displayName ?? "Scoped classes"}</p><p className="mt-1 text-xs text-slate-500">{publication._count.studentPublications} recipient records / published {publication.publishedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(publication.publishedAt) : "date unavailable"}</p></article>)}
      </section>
      {publications.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No published GradeBook history is available in this scope.</p> : null}
    </div>
  );
}
