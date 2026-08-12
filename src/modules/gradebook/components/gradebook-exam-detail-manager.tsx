"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import {
  activateMvpExamAction,
  assignTeacherToExamAction,
  cancelMvpExamAction,
  publishExamScheduleAction,
  revokeTeacherAssignmentAction,
  upsertExamScheduleAction
} from "@/modules/gradebook/mvp-actions";

type ExamClassSection = { id: string; name: string };
type ExamSubject = { id: string; name: string; code: string; components: Array<{ id: string; name: string; code: string }> };

type Props = {
  exam: {
    id: string;
    code: string;
    name: string;
    status: string;
    termName: string;
    examTypeName: string;
    marksEntryOpensAt: string | null;
    marksEntryClosesAt: string | null;
  };
  readiness: { ready: boolean; blockers: Array<{ code: string; message: string }> } | null;
  capabilities: {
    canActivate: boolean;
    canCancel: boolean;
    canManageAssignments: boolean;
    canManageSchedule: boolean;
    canPublishSchedule: boolean;
  };
  classSections: ExamClassSection[];
  subjects: ExamSubject[];
  teachers: Array<{ id: string; name: string; email: string }>;
  assignments: Array<{ id: string; status: string; teacherName: string; classSectionName: string; subjectName: string; componentName: string | null }>;
  schedules: Array<{ id: string; status: string; classSectionName: string; subjectName: string; examDate: string; startTime: string; endTime: string; roomName: string | null }>;
  batches: Array<{ id: string; status: string; version: number }>;
  resultRuns: Array<{ id: string; status: string; createdAt: string }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

function resultFeedback(result: GradebookActionResult<unknown>): Feedback {
  return result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error };
}

function stringValue(form: FormData, key: string) {
  return String(form.get(key) ?? "");
}

export function GradebookExamDetailManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [assignmentSubjectId, setAssignmentSubjectId] = useState(props.subjects[0]?.id ?? "");
  const [scheduleSubjectId, setScheduleSubjectId] = useState(props.subjects[0]?.id ?? "");

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(resultFeedback(result));
      if (result.ok) router.refresh();
    });
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => assignTeacherToExamAction({
      examId: props.exam.id,
      examClassSectionId: stringValue(form, "examClassSectionId"),
      examSubjectId: stringValue(form, "examSubjectId"),
      examSubjectComponentId: stringValue(form, "examSubjectComponentId") || undefined,
      teacherUserId: stringValue(form, "teacherUserId"),
      isPrimary: true,
      canEdit: true,
      canSubmit: true,
      validFrom: stringValue(form, "validFrom") || undefined,
      validUntil: stringValue(form, "validUntil") || undefined,
      overrideReason: stringValue(form, "overrideReason")
    }));
  }

  function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => upsertExamScheduleAction({
      examId: props.exam.id,
      examClassSectionId: stringValue(form, "examClassSectionId"),
      examSubjectId: stringValue(form, "examSubjectId"),
      examSubjectComponentId: stringValue(form, "examSubjectComponentId") || undefined,
      examDate: stringValue(form, "examDate"),
      startTime: stringValue(form, "startTime"),
      endTime: stringValue(form, "endTime"),
      reportingTime: stringValue(form, "reportingTime") || undefined,
      roomName: stringValue(form, "roomName") || undefined,
      instructions: stringValue(form, "instructions") || undefined
    }));
  }

  function cancelExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => cancelMvpExamAction({ examId: props.exam.id, reason: stringValue(form, "reason") }));
  }

  const assignmentComponents = props.subjects.find((subject) => subject.id === assignmentSubjectId)?.components ?? [];
  const scheduleComponents = props.subjects.find((subject) => subject.id === scheduleSubjectId)?.components ?? [];

  return (
    <div className="space-y-6">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Examination summary">
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Status</p><div className="mt-2"><StatusBadge value={props.exam.status} /></div></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Term</p><p className="mt-1 font-semibold text-ink">{props.exam.termName}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Exam type</p><p className="mt-1 font-semibold text-ink">{props.exam.examTypeName}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Teacher assignments</p><p className="mt-1 text-xl font-semibold text-ink">{props.assignments.filter((item) => item.status === "ACTIVE" || item.status === "DRAFT").length}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Marks batches</p><p className="mt-1 text-xl font-semibold text-ink">{props.batches.length}</p></div>
      </section>

      {props.readiness ? (
        <section className={`rounded-lg border p-5 ${props.readiness.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} aria-labelledby="exam-readiness-title">
          <h2 id="exam-readiness-title" className="font-semibold text-ink">{props.readiness.ready ? "Ready to activate" : "Readiness checks"}</h2>
          {props.readiness.ready ? <p className="mt-1 text-sm text-emerald-700">All required configuration, assignments, and schedules are ready.</p> : <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">{props.readiness.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul>}
          {props.capabilities.canActivate && props.readiness.ready && ["DRAFT", "CONFIGURED", "SCHEDULED", "REOPENED"].includes(props.exam.status) ? <button type="button" disabled={pending} onClick={() => run(() => activateMvpExamAction({ examId: props.exam.id }))} className="premium-primary-button mt-4">{pending ? "Activating..." : "Activate marks workflow"}</button> : null}
        </section>
      ) : null}

      {props.capabilities.canManageAssignments ? (
        <section className="premium-card space-y-4 p-5" aria-labelledby="teacher-assignment-title">
          <div><h2 id="teacher-assignment-title" className="text-lg font-semibold text-ink">Teacher assignments</h2><p className="mt-1 text-sm text-slate-500">An exact class-section and subject assignment is mandatory. Role membership alone never grants marks access.</p></div>
          <form onSubmit={submitAssignment} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Class-section<select name="examClassSectionId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select class-section</option>{props.classSections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Subject<select name="examSubjectId" required value={assignmentSubjectId} disabled={pending} onChange={(event) => setAssignmentSubjectId(event.target.value)} className={`mt-2 ${fieldClass}`}><option value="">Select subject</option>{props.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Component scope<select name="examSubjectComponentId" disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">All subject components</option>{assignmentComponents.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Teacher<select name="teacherUserId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select teacher</option>{props.teachers.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.email})</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Valid from<input name="validFrom" type="datetime-local" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Valid until<input name="validUntil" type="datetime-local" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Manual assignment reason<input name="overrideReason" required minLength={10} maxLength={1000} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Approved reason for this exact teacher assignment" /></label>
            <div className="md:col-span-2 xl:col-span-4"><button type="submit" disabled={pending} className="premium-primary-button w-full sm:w-auto">{pending ? "Assigning..." : "Assign teacher"}</button></div>
          </form>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {props.assignments.map((assignment) => <article key={assignment.id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-ink">{assignment.teacherName}</h3><p className="mt-1 text-xs text-slate-500">{assignment.classSectionName} / {assignment.subjectName}{assignment.componentName ? ` / ${assignment.componentName}` : ""}</p></div><StatusBadge value={assignment.status} /></div>{assignment.status !== "REVOKED" ? <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); run(() => revokeTeacherAssignmentAction({ assignmentId: assignment.id, reason: stringValue(form, "reason") })); }}><input name="reason" required minLength={10} maxLength={1000} disabled={pending} className={fieldClass} placeholder="Revocation reason" /><button type="submit" disabled={pending} className="premium-secondary-button">Revoke</button></form> : null}</article>)}
          </div>
        </section>
      ) : null}

      {props.capabilities.canManageSchedule ? (
        <section className="premium-card space-y-4 p-5" aria-labelledby="exam-schedule-title">
          <div><h2 id="exam-schedule-title" className="text-lg font-semibold text-ink">Examination schedule</h2><p className="mt-1 text-sm text-slate-500">Schedule each required class-section and subject. Overlapping rooms or classes are rejected server-side.</p></div>
          <form onSubmit={submitSchedule} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Class-section<select name="examClassSectionId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select class-section</option>{props.classSections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Subject<select name="examSubjectId" required value={scheduleSubjectId} disabled={pending} onChange={(event) => setScheduleSubjectId(event.target.value)} className={`mt-2 ${fieldClass}`}><option value="">Select subject</option>{props.subjects.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Component<select name="examSubjectComponentId" disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Whole subject</option>{scheduleComponents.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Exam date<input name="examDate" type="date" required disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Start time<input name="startTime" type="time" required disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">End time<input name="endTime" type="time" required disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Reporting time<input name="reportingTime" type="time" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Room<input name="roomName" maxLength={120} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Optional" /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">Instructions<input name="instructions" maxLength={2000} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Optional schedule instructions" /></label>
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4"><button type="submit" disabled={pending} className="premium-primary-button">{pending ? "Saving..." : "Save draft schedule"}</button>{props.capabilities.canPublishSchedule && props.schedules.some((item) => item.status === "DRAFT") ? <button type="button" disabled={pending} onClick={() => run(() => publishExamScheduleAction({ examId: props.exam.id }))} className="premium-secondary-button">Publish all draft schedules</button> : null}</div>
          </form>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.schedules.map((schedule) => <article key={schedule.id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-ink">{schedule.classSectionName} / {schedule.subjectName}</h3><StatusBadge value={schedule.status} /></div><p className="mt-2 text-sm text-slate-600">{schedule.examDate}, {schedule.startTime}-{schedule.endTime}</p>{schedule.roomName ? <p className="mt-1 text-xs text-slate-500">Room: {schedule.roomName}</p> : null}</article>)}</div>
        </section>
      ) : null}

      <section className="premium-card p-5" aria-labelledby="exam-output-title">
        <h2 id="exam-output-title" className="text-lg font-semibold text-ink">Workflow outputs</h2>
        <p className="mt-1 text-sm text-slate-500">Marks batches and immutable result runs created for this exam.</p>
        <div className="mt-4 flex flex-wrap gap-2"><Link href="/gradebook/marks" className="premium-secondary-button">Marks batches ({props.batches.length})</Link><Link href="/gradebook/results" className="premium-secondary-button">Result runs ({props.resultRuns.length})</Link></div>
      </section>

      {props.capabilities.canCancel && !["PUBLISHED", "ARCHIVED", "CANCELLED"].includes(props.exam.status) ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-5" aria-labelledby="cancel-exam-title">
          <h2 id="cancel-exam-title" className="text-lg font-semibold text-rose-900">Cancel examination</h2>
          <p className="mt-1 text-sm text-rose-700">Cancellation stops draft schedules and editable marks batches. Published results cannot be cancelled here.</p>
          <form onSubmit={cancelExam} className="mt-4 flex flex-col gap-3 sm:flex-row"><input name="reason" required minLength={10} maxLength={1000} disabled={pending} className={fieldClass} placeholder="Required cancellation reason" /><button type="submit" disabled={pending} className="premium-secondary-button border-rose-300 text-rose-700">Cancel exam</button></form>
        </section>
      ) : null}
    </div>
  );
}
