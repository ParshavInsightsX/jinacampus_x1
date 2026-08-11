"use client";

import { useActionState, useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/table-primitives";
import {
  cancelAcademicCalendarEntryAction,
  createAcademicCalendarEntryAction,
  updateAcademicCalendarEntryAction,
  type AcademicCalendarActionState
} from "./calendar-actions";

type CalendarInstitution = {
  id: string;
  name: string;
  canManageAllBranches: boolean;
  branches: Array<{ id: string; name: string; code: string }>;
  academicYears: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }>;
};

type CalendarEntry = {
  id: string;
  institutionId: string;
  branchId: string | null;
  academicYearId: string;
  entryType: "HOLIDAY" | "NON_WORKING_DAY";
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  audiences: Array<"STUDENTS" | "TEACHING_STAFF" | "NON_TEACHING_STAFF">;
  status: "ACTIVE" | "CANCELLED";
  cancellationReason: string | null;
  canManage: boolean;
  institutionName: string;
  branchName: string;
  academicYearName: string;
  generatedStaffRecordCount: number;
};

const initialState: AcademicCalendarActionState = { ok: false };
const audienceOptions = [
  { value: "STUDENTS", label: "Students" },
  { value: "TEACHING_STAFF", label: "Teaching staff" },
  { value: "NON_TEACHING_STAFF", label: "Non-teaching staff" }
] as const;

function ActionResult({ state }: { state: AcademicCalendarActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg border p-3 text-sm ${state.ok
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-rose-200 bg-rose-50 text-rose-900"}`}
    >
      {state.message}
    </p>
  );
}

function CalendarEntryForm({
  institutions,
  entry,
  action,
  pending,
  submitLabel
}: {
  institutions: CalendarInstitution[];
  entry?: CalendarEntry;
  action: (payload: FormData) => void;
  pending: boolean;
  submitLabel: string;
}) {
  const initialInstitution = institutions.find((institution) => institution.id === entry?.institutionId) ?? institutions[0];
  const [institutionId, setInstitutionId] = useState(initialInstitution?.id ?? "");
  const institution = useMemo(
    () => institutions.find((option) => option.id === institutionId) ?? institutions[0],
    [institutionId, institutions]
  );
  const defaultYear = institution?.academicYears.find((year) => year.id === entry?.academicYearId) ??
    institution?.academicYears.find((year) => year.isActive) ??
    institution?.academicYears[0];
  const [academicYearId, setAcademicYearId] = useState(defaultYear?.id ?? "");
  const selectedYear = institution?.academicYears.find((year) => year.id === academicYearId) ?? defaultYear;
  const defaultBranchId = entry?.branchId ?? (institution?.canManageAllBranches ? "" : institution?.branches[0]?.id ?? "");
  const [branchId, setBranchId] = useState(defaultBranchId);

  function changeInstitution(nextInstitutionId: string) {
    const nextInstitution = institutions.find((option) => option.id === nextInstitutionId);
    const nextYear = nextInstitution?.academicYears.find((year) => year.isActive) ?? nextInstitution?.academicYears[0];
    setInstitutionId(nextInstitutionId);
    setAcademicYearId(nextYear?.id ?? "");
    setBranchId(nextInstitution?.canManageAllBranches ? "" : nextInstitution?.branches[0]?.id ?? "");
  }

  return (
    <form action={action} className="space-y-4">
      {entry ? <input type="hidden" name="calendarEntryId" value={entry.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Institution
          <select
            name="institutionId"
            value={institutionId}
            onChange={(event) => changeInstitution(event.target.value)}
            disabled={pending}
            required
            className="mt-2 min-h-11 w-full"
          >
            {institutions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Academic year
          <select
            name="academicYearId"
            value={academicYearId}
            onChange={(event) => setAcademicYearId(event.target.value)}
            disabled={pending}
            required
            className="mt-2 min-h-11 w-full"
          >
            {institution?.academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Branch scope
          <select
            name="branchId"
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            disabled={pending}
            className="mt-2 min-h-11 w-full"
          >
            <option value="" disabled={!institution?.canManageAllBranches}>All active branches</option>
            {institution?.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Calendar type
          <select name="entryType" defaultValue={entry?.entryType ?? "HOLIDAY"} disabled={pending} className="mt-2 min-h-11 w-full">
            <option value="HOLIDAY">Holiday</option>
            <option value="NON_WORKING_DAY">Non-working day</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Name
          <input name="name" defaultValue={entry?.name ?? ""} minLength={2} maxLength={120} disabled={pending} required className="mt-2 min-h-11 w-full" />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Start date
          <input
            name="startDate"
            type="date"
            defaultValue={entry?.startDate ?? selectedYear?.startDate ?? ""}
            min={selectedYear?.startDate}
            max={selectedYear?.endDate}
            disabled={pending}
            required
            className="mt-2 min-h-11 w-full"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          End date
          <input
            name="endDate"
            type="date"
            defaultValue={entry?.endDate ?? selectedYear?.startDate ?? ""}
            min={selectedYear?.startDate}
            max={selectedYear?.endDate}
            disabled={pending}
            required
            className="mt-2 min-h-11 w-full"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-1">
          Description
          <textarea name="description" defaultValue={entry?.description ?? ""} rows={3} maxLength={1000} disabled={pending} className="mt-2 w-full" />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-slate-700">Applicable groups</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {audienceOptions.map((option) => (
            <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="audiences"
                value={option.value}
                defaultChecked={entry ? entry.audiences.includes(option.value) : true}
                disabled={pending}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs leading-5 text-slate-500">
        Student dates are excluded from attendance percentages. Applicable staff receive paid HOLIDAY records. Existing attendance or active leave blocks unsafe calendar changes.
      </p>
      <button disabled={pending || !institutions.length || !institution?.academicYears.length} className="premium-primary-button min-h-11 w-full sm:w-auto">
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}

function audienceLabel(audiences: CalendarEntry["audiences"]) {
  return audiences.map((audience) => audienceOptions.find((option) => option.value === audience)?.label ?? audience).join(", ");
}

export function AcademicCalendarManager({
  institutions,
  entries
}: {
  institutions: CalendarInstitution[];
  entries: CalendarEntry[];
}) {
  const [createState, createAction, createPending] = useActionState(createAcademicCalendarEntryAction, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateAcademicCalendarEntryAction, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelAcademicCalendarEntryAction, initialState);

  return (
    <div className="space-y-6">
      <section className="premium-card space-y-4 p-4 sm:p-5" aria-labelledby="create-calendar-entry-title">
        <div>
          <h2 id="create-calendar-entry-title" className="text-lg font-semibold text-slate-950">Add holiday or non-working day</h2>
          <p className="mt-1 text-sm text-slate-500">Scope the entry to an institution, branch, academic year, date range, and applicable groups.</p>
        </div>
        <ActionResult state={createState} />
        {institutions.length ? (
          <CalendarEntryForm institutions={institutions} action={createAction} pending={createPending} submitLabel="Add calendar entry" />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">No authorised active branch and academic-year combination is available.</p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="calendar-entries-title">
        <div>
          <h2 id="calendar-entries-title" className="text-lg font-semibold text-slate-950">Calendar entries</h2>
          <p className="mt-1 text-sm text-slate-500">Active and cancelled records remain visible for operational history and audit review.</p>
        </div>
        <ActionResult state={updateState} />
        <ActionResult state={cancelState} />
        {entries.length ? entries.map((entry) => (
          <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-950">{entry.name}</h3>
                  <StatusBadge value={entry.status} />
                  <StatusBadge value={entry.entryType} label={entry.entryType === "HOLIDAY" ? "Holiday" : "Non-working day"} />
                </div>
                <p className="mt-2 text-sm text-slate-600">{entry.startDate}{entry.endDate !== entry.startDate ? ` to ${entry.endDate}` : ""}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{entry.institutionName} · {entry.branchName} · {entry.academicYearName}</p>
              </div>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
                {entry.generatedStaffRecordCount} staff holiday records
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-slate-700">Applicable groups</dt><dd className="mt-1 text-slate-600">{audienceLabel(entry.audiences)}</dd></div>
              <div><dt className="font-semibold text-slate-700">Description</dt><dd className="mt-1 text-slate-600">{entry.description ?? "No description"}</dd></div>
              {entry.cancellationReason ? <div className="sm:col-span-2"><dt className="font-semibold text-slate-700">Cancellation reason</dt><dd className="mt-1 text-slate-600">{entry.cancellationReason}</dd></div> : null}
            </dl>
            {entry.status === "ACTIVE" && entry.canManage ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <details className="rounded-lg border border-slate-200 p-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand-700">Edit calendar entry</summary>
                  <div className="mt-4">
                    <CalendarEntryForm institutions={institutions} entry={entry} action={updateAction} pending={updatePending} submitLabel="Save calendar changes" />
                  </div>
                </details>
                <details className="rounded-lg border border-rose-200 p-4">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-rose-700">Cancel calendar entry</summary>
                  <form action={cancelAction} className="mt-4 space-y-3">
                    <input type="hidden" name="calendarEntryId" value={entry.id} />
                    <label className="text-sm font-semibold text-slate-700">
                      Cancellation reason
                      <textarea name="cancellationReason" minLength={5} maxLength={500} rows={3} required disabled={cancelPending} className="mt-2 w-full" />
                    </label>
                    <p className="text-xs leading-5 text-slate-500">Generated staff holiday rows will return to NOT_MARKED. Historical attendance must then be reviewed by an authorised user.</p>
                    <button disabled={cancelPending} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
                      {cancelPending ? "Cancelling..." : "Cancel entry"}
                    </button>
                  </form>
                </details>
              </div>
            ) : entry.status === "ACTIVE" ? (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                This institution-wide entry is visible because it applies to your branch. Changes require access to every active branch in the institution.
              </p>
            ) : null}
          </article>
        )) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No calendar entries have been configured.</p>
        )}
      </section>
    </div>
  );
}
