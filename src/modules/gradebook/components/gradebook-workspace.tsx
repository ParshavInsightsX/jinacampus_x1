"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { FormField } from "@/components/ui/form-primitives";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import {
  assignClassSectionSubjectAction,
  createGradebookAssessmentAction,
  updateClassSectionSubjectAction,
  type GradebookActionResult
} from "@/modules/gradebook/actions";

export type GradebookWorkspaceProps = {
  branchName: string;
  academicYearName: string;
  capabilities: {
    canManageSetup: boolean;
    canManageAssessments: boolean;
    canEnterMarks: boolean;
    canPublish: boolean;
    canViewReports: boolean;
  };
  classSections: Array<{ id: string; displayName: string }>;
  subjects: Array<{ id: string; code: string; name: string; type: string }>;
  teachers: Array<{ id: string; name: string; email: string }>;
  assignments: Array<{
    id: string;
    classSectionId: string;
    classSectionName: string;
    subjectCode: string;
    subjectName: string;
    teacherUserId: string | null;
    teacherName: string | null;
    status: string;
    assessmentCount: number;
  }>;
  assessments: Array<{
    id: string;
    code: string;
    title: string;
    type: string;
    assessmentDate: string;
    maxMarks: string;
    passMarks: string;
    status: string;
    publishedAt: string | null;
    classSectionName: string;
    subjectCode: string;
    subjectName: string;
    markCount: number;
  }>;
};

type UiMessage = { tone: "success" | "error"; text: string } | null;

const inputClassName = "min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 py-2 text-sm text-ink shadow-sm premium-focus";

function resultMessage(result: GradebookActionResult<unknown>): UiMessage {
  return result.ok
    ? { tone: "success", text: result.message }
    : { tone: "error", text: result.error };
}

function ActionMessage({ message }: { message: UiMessage }) {
  if (!message) return null;
  return (
    <p
      role={message.tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
        message.tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {message.text}
    </p>
  );
}

export function GradebookWorkspace(props: GradebookWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<UiMessage>(null);
  const [classSectionId, setClassSectionId] = useState(props.classSections[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(props.subjects[0]?.id ?? "");
  const [teacherUserId, setTeacherUserId] = useState("");
  const activeAssignments = props.assignments.filter((assignment) => assignment.status === "ACTIVE");
  const [assessmentAssignmentId, setAssessmentAssignmentId] = useState(activeAssignments[0]?.id ?? "");
  const selectedAssessmentAssignmentId = activeAssignments.some(
    (assignment) => assignment.id === assessmentAssignmentId
  )
    ? assessmentAssignmentId
    : activeAssignments[0]?.id ?? "";

  function perform(action: () => Promise<GradebookActionResult<unknown>>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result));
      if (result.ok) router.refresh();
    });
  }

  function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    perform(() => assignClassSectionSubjectAction({
      classSectionId,
      subjectId,
      teacherUserId: teacherUserId || undefined
    }));
  }

  function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    perform(() => createGradebookAssessmentAction({
      classSectionSubjectId: selectedAssessmentAssignmentId,
      code: formData.get("code"),
      title: formData.get("title"),
      type: formData.get("type"),
      assessmentDate: formData.get("assessmentDate"),
      maxMarks: formData.get("maxMarks"),
      passMarks: formData.get("passMarks")
    }));
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2" aria-label="GradeBook context">
        <div className="premium-card p-4">
          <p className="text-xs font-semibold text-slate-500">Active branch</p>
          <p className="mt-1 font-semibold text-ink">{props.branchName}</p>
        </div>
        <div className="premium-card p-4">
          <p className="text-xs font-semibold text-slate-500">Academic year</p>
          <p className="mt-1 font-semibold text-ink">{props.academicYearName}</p>
        </div>
      </section>

      <ActionMessage message={message} />

      {props.capabilities.canManageSetup ? (
        <section className="premium-card p-5" aria-labelledby="gradebook-subject-assignment-title">
          <div>
            <h2 id="gradebook-subject-assignment-title" className="text-lg font-semibold text-ink">Class subjects</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Assign an existing Academia subject to a class-section and optionally designate the marks-entry teacher.
            </p>
          </div>
          <form onSubmit={submitAssignment} className="mt-5 grid gap-4 lg:grid-cols-3">
            <FormField id="gradebook-class-section" label="Class-section" required>
              <select id="gradebook-class-section" value={classSectionId} onChange={(event) => setClassSectionId(event.target.value)} disabled={pending} className={inputClassName}>
                {props.classSections.map((option) => <option key={option.id} value={option.id}>{option.displayName}</option>)}
              </select>
            </FormField>
            <FormField id="gradebook-subject" label="Subject" required>
              <select id="gradebook-subject" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={pending} className={inputClassName}>
                {props.subjects.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}
              </select>
            </FormField>
            <FormField id="gradebook-teacher" label="Marks-entry teacher" helpText="The class teacher also retains assigned-class access.">
              <select id="gradebook-teacher" value={teacherUserId} onChange={(event) => setTeacherUserId(event.target.value)} disabled={pending} className={inputClassName}>
                <option value="">No subject teacher</option>
                {props.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
            </FormField>
            <button type="submit" disabled={pending || !classSectionId || !subjectId} className="premium-primary-button lg:col-start-3">
              {pending ? "Saving..." : "Assign subject"}
            </button>
          </form>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {props.assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-lg border border-campus-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">{assignment.classSectionName}</p>
                    <h3 className="mt-1 font-semibold text-ink">{assignment.subjectCode} - {assignment.subjectName}</h3>
                  </div>
                  <StatusBadge value={assignment.status} />
                </div>
                <p className="mt-3 text-sm text-slate-600">Teacher: {assignment.teacherName ?? "Not assigned"}</p>
                <p className="mt-1 text-xs text-slate-500">{assignment.assessmentCount} assessment{assignment.assessmentCount === 1 ? "" : "s"}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <select
                    aria-label={`Teacher for ${assignment.subjectName} in ${assignment.classSectionName}`}
                    defaultValue={assignment.teacherUserId ?? ""}
                    disabled={pending}
                    className={inputClassName}
                    onChange={(event) => perform(() => updateClassSectionSubjectAction({
                      classSectionSubjectId: assignment.id,
                      teacherUserId: event.target.value || null
                    }))}
                  >
                    <option value="">No subject teacher</option>
                    {props.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={pending || (assignment.status === "ACTIVE" && assignment.assessmentCount > 0)}
                    onClick={() => perform(() => updateClassSectionSubjectAction({
                      classSectionSubjectId: assignment.id,
                      status: assignment.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
                    }))}
                    className="premium-secondary-button"
                  >
                    {assignment.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </article>
            ))}
            {props.assignments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-campus-border p-4 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                No class subjects are assigned for this branch and academic year.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {props.capabilities.canManageAssessments ? (
        <section className="premium-card p-5" aria-labelledby="gradebook-assessment-create-title">
          <div>
            <h2 id="gradebook-assessment-create-title" className="text-lg font-semibold text-ink">Create assessment</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">Create an assessment only after its class subject is active.</p>
          </div>
          <form onSubmit={submitAssessment} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField id="assessment-class-subject" label="Class and subject" required className="md:col-span-2">
              <select id="assessment-class-subject" value={selectedAssessmentAssignmentId} onChange={(event) => setAssessmentAssignmentId(event.target.value)} disabled={pending} className={inputClassName}>
                {activeAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>{assignment.classSectionName} - {assignment.subjectCode} {assignment.subjectName}</option>
                ))}
              </select>
            </FormField>
            <FormField id="assessment-code" label="Assessment code" required>
              <input id="assessment-code" name="code" required maxLength={40} disabled={pending} className={inputClassName} placeholder="UT1-MATH" />
            </FormField>
            <FormField id="assessment-type" label="Type" required>
              <select id="assessment-type" name="type" defaultValue="UNIT_TEST" disabled={pending} className={inputClassName}>
                {["UNIT_TEST", "PERIODIC_TEST", "HALF_YEARLY", "ANNUAL", "PROJECT", "PRACTICAL", "OTHER"].map((type) => (
                  <option key={type} value={type}>{formatEnumLabel(type)}</option>
                ))}
              </select>
            </FormField>
            <FormField id="assessment-title" label="Title" required className="md:col-span-2">
              <input id="assessment-title" name="title" required maxLength={120} disabled={pending} className={inputClassName} placeholder="Unit Test 1" />
            </FormField>
            <FormField id="assessment-date" label="Assessment date" required>
              <input id="assessment-date" name="assessmentDate" type="date" required disabled={pending} className={inputClassName} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="assessment-max-marks" label="Maximum" required>
                <input id="assessment-max-marks" name="maxMarks" type="number" min="1" max="1000" step="0.01" required disabled={pending} className={inputClassName} />
              </FormField>
              <FormField id="assessment-pass-marks" label="Pass marks" required>
                <input id="assessment-pass-marks" name="passMarks" type="number" min="0" max="1000" step="0.01" required disabled={pending} className={inputClassName} />
              </FormField>
            </div>
            <button type="submit" disabled={pending || !selectedAssessmentAssignmentId} className="premium-primary-button md:col-start-2 xl:col-start-4">
              {pending ? "Creating..." : "Create assessment"}
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-4" aria-labelledby="gradebook-assessment-list-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="gradebook-assessment-list-title" className="text-lg font-semibold text-ink">Assessments</h2>
            <p className="mt-1 text-sm text-slate-500">Open a permitted assessment to enter or review student results.</p>
          </div>
          {props.capabilities.canViewReports ? <Link href="/gradebook/reports" className="premium-secondary-button">Published results</Link> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.assessments.map((assessment) => (
            <article key={assessment.id} className="premium-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">{assessment.classSectionName} / {assessment.subjectCode}</p>
                  <h3 className="mt-1 text-base font-semibold text-ink">{assessment.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{assessment.code} / {formatEnumLabel(assessment.type)}</p>
                </div>
                <StatusBadge value={assessment.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Date</dt><dd className="mt-1 font-semibold text-ink">{assessment.assessmentDate}</dd></div>
                <div><dt className="text-xs text-slate-500">Marks</dt><dd className="mt-1 font-semibold text-ink">{assessment.passMarks} / {assessment.maxMarks} pass</dd></div>
                <div><dt className="text-xs text-slate-500">Results entered</dt><dd className="mt-1 font-semibold text-ink">{assessment.markCount}</dd></div>
                <div><dt className="text-xs text-slate-500">Subject</dt><dd className="mt-1 font-semibold text-ink">{assessment.subjectName}</dd></div>
              </dl>
              <Link href={`/gradebook/assessments/${assessment.id}`} className="premium-primary-button mt-5 w-full">
                {assessment.status === "OPEN" && props.capabilities.canEnterMarks ? "Enter marks" : "View results"}
              </Link>
            </article>
          ))}
        </div>
        {props.assessments.length === 0 ? (
          <p className="premium-card border-dashed p-5 text-sm text-slate-500">No assessments are available in your assigned scope.</p>
        ) : null}
      </section>
    </div>
  );
}
