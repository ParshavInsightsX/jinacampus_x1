"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSchoolCastHomeworkAction } from "@/modules/schoolcast/actions";

type Assignment = { classSectionId: string; subjectId: string; classSection: { displayName: string }; subject: { code: string; name: string } };

export function HomeworkComposer({ branchId, academicYearId, assignments }: { branchId: string; academicYearId: string; assignments: readonly Assignment[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState(assignments[0] ? `${assignments[0].classSectionId}:${assignments[0].subjectId}` : "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [classSectionId, subjectId] = scope.split(":");
    startTransition(async () => {
      const result = await createSchoolCastHomeworkAction({
        branchId,
        academicYearId,
        classSectionId,
        subjectId,
        workType: form.get("workType"),
        title: form.get("title"),
        instructions: form.get("instructions"),
        assignmentDate: form.get("assignmentDate"),
        completionDueAt: form.get("completionDueAt") ? new Date(String(form.get("completionDueAt"))).toISOString() : undefined,
        teacherRemarks: form.get("teacherRemarks") || undefined
      });
      if (!result.ok) { setError(result.error); return; }
      router.push("/schoolcast/homework/" + String(result.data.id));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
      <section className="premium-card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-slate-700">Assigned class and subject
            <select value={scope} onChange={(event) => setScope(event.target.value)} required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal">
              {assignments.map((assignment) => <option key={`${assignment.classSectionId}:${assignment.subjectId}`} value={`${assignment.classSectionId}:${assignment.subjectId}`}>{assignment.classSection.displayName} / {assignment.subject.code} - {assignment.subject.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">Work type
            <select name="workType" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal"><option value="HOMEWORK">Homework</option><option value="CLASSWORK">Classwork</option></select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">Assignment date
            <input type="date" name="assignmentDate" required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">Completion due
            <input type="datetime-local" name="completionDueAt" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Title
          <input name="title" minLength={3} maxLength={180} required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Instructions
          <textarea name="instructions" required maxLength={12000} rows={8} disabled={pending} className="w-full rounded-lg border border-slate-200 p-3 font-normal leading-6" />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Teacher note (optional)
          <textarea name="teacherRemarks" maxLength={2000} rows={3} disabled={pending} className="w-full rounded-lg border border-slate-200 p-3 font-normal" />
        </label>
      </section>
      <div className="sticky bottom-24 z-10 flex justify-end rounded-lg border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur lg:bottom-32">
        <button type="submit" disabled={pending || assignments.length === 0} className="premium-primary-button min-h-11 w-full sm:w-auto">{pending ? "Saving..." : "Save draft"}</button>
      </div>
    </form>
  );
}