import Link from "next/link";

import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { StatusBadge } from "@/components/ui/table-primitives";
import { getGradebookMarksQueue } from "@/modules/gradebook/queries";

function teacherName(teacher: { displayName: string | null; firstName: string; lastName: string | null; email: string }) {
  return teacher.displayName ?? ([teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || teacher.email);
}

export default async function GradebookMarksPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookMarksQueue(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="Marks Entry" description="Assigned, version-controlled marks batches for the active branch and academic year." />
      <div className="flex flex-wrap gap-2">
        <Link href="/gradebook/submissions" className="premium-secondary-button">Submission queue</Link>
        {workspace.capabilities.canVerify ? <Link href="/gradebook/verification" className="premium-secondary-button">Verification queue</Link> : null}
        {workspace.capabilities.canApprove ? <Link href="/gradebook/approvals" className="premium-secondary-button">Approval queue</Link> : null}
        {workspace.capabilities.canImport ? <Link href="/gradebook/imports" className="premium-secondary-button">Spreadsheet imports</Link> : null}
      </div>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Marks batches">
        {workspace.batches.map((batch) => (
          <article key={batch.id} className="premium-card p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{batch.exam.name}</p><h2 className="mt-1 font-semibold text-ink">{batch.examClassSection.classSection.displayName} / {batch.examSubject.subject.name}</h2></div><StatusBadge value={batch.status} /></div>
            <p className="mt-3 text-xs text-slate-500">Teacher: {teacherName(batch.teacherAssignment.teacherUser)}</p>
            <p className="mt-1 text-xs text-slate-500">{batch.examSubject.components.length} component{batch.examSubject.components.length === 1 ? "" : "s"} / {batch._count.marks} saved entries</p>
            <Link href={`/gradebook/marks/${batch.id}`} className="premium-primary-button mt-4 w-full">Open marks batch</Link>
          </article>
        ))}
      </section>
      {workspace.batches.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No marks batches are assigned in this scope. An authorised coordinator must assign an exact teacher, class-section, and subject first.</p> : null}
    </div>
  );
}
