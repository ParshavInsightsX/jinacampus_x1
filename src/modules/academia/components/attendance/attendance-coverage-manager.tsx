"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, ShieldAlert, UserRoundCheck } from "lucide-react";
import {
  acknowledgeStudentAttendanceDutyAction,
  createStudentAttendanceDutyAssignmentAction,
  declineStudentAttendanceDutyAction,
  revokeStudentAttendanceDutyAction
} from "@/modules/academia/actions/student-attendance-duty.actions";
import type { AttendanceDutyActionState } from "@/modules/academia/actions/student-attendance-duty.actions";
import type { StudentAttendanceCoverageView } from "@/modules/academia/services/student-attendance-duty.service";

const INITIAL_ATTENDANCE_DUTY_ACTION_STATE: AttendanceDutyActionState = {
  ok: false,
  message: null
};

function ActionMessage({ state }: { state: { ok: boolean; message: string | null } }) {
  if (!state.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-lg border px-3 py-2 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}
    >
      {state.message}
    </p>
  );
}

function DutyActions({ item, canManageCoverage }: {
  item: StudentAttendanceCoverageView["classes"][number];
  canManageCoverage: boolean;
}) {
  const [acknowledgeState, acknowledgeAction, acknowledging] = useActionState(
    acknowledgeStudentAttendanceDutyAction,
    INITIAL_ATTENDANCE_DUTY_ACTION_STATE
  );
  const [declineState, declineAction, declining] = useActionState(
    declineStudentAttendanceDutyAction,
    INITIAL_ATTENDANCE_DUTY_ACTION_STATE
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeStudentAttendanceDutyAction,
    INITIAL_ATTENDANCE_DUTY_ACTION_STATE
  );
  const duty = item.duty;
  if (!duty) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      {duty.isMine && duty.status === "PENDING" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={acknowledgeAction}>
            <input type="hidden" name="assignmentId" value={duty.id} />
            <button type="submit" disabled={acknowledging} className="premium-primary-button min-h-11 w-full premium-focus">
              {acknowledging ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <CheckCircle2 aria-hidden="true" className="size-4" />}
              Acknowledge Duty
            </button>
          </form>
          <form action={declineAction} className="space-y-2">
            <input type="hidden" name="assignmentId" value={duty.id} />
            <label className="block text-xs font-semibold text-slate-700">
              Reason for declining
              <input name="reason" minLength={5} maxLength={300} required className="mt-1 min-h-11 w-full" placeholder="Explain why another person is needed" />
            </label>
            <button type="submit" disabled={declining} className="premium-secondary-button min-h-11 w-full premium-focus">
              {declining ? "Declining..." : "Decline Duty"}
            </button>
          </form>
        </div>
      ) : null}

      {canManageCoverage ? (
        <form action={revokeAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="assignmentId" value={duty.id} />
          <label className="block text-xs font-semibold text-slate-700">
            Reason for revoking
            <input name="reason" minLength={5} maxLength={300} required className="mt-1 min-h-11 w-full" placeholder="Record why coverage changed" />
          </label>
          <button type="submit" disabled={revoking} className="premium-secondary-button min-h-11 premium-focus">
            {revoking ? "Revoking..." : "Revoke Duty"}
          </button>
        </form>
      ) : null}

      <ActionMessage state={acknowledgeState} />
      <ActionMessage state={declineState} />
      <ActionMessage state={revokeState} />
    </div>
  );
}

export function AttendanceCoverageManager({ view }: { view: StudentAttendanceCoverageView }) {
  const [createState, createAction, creating] = useActionState(
    createStudentAttendanceDutyAssignmentAction,
    INITIAL_ATTENDANCE_DUTY_ACTION_STATE
  );

  return (
    <div className="space-y-5">
      <section aria-label="Attendance coverage summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Active Classes", value: view.summary.total, Icon: UserRoundCheck, tone: "text-indigo-700" },
          { label: "Completed", value: view.summary.completed, Icon: CheckCircle2, tone: "text-emerald-700" },
          { label: "Duty Assigned", value: view.summary.covered, Icon: Clock3, tone: "text-cyan-700" },
          { label: "Needs Coverage", value: view.summary.needsCoverage, Icon: ShieldAlert, tone: "text-rose-700" }
        ].map(({ label, value, Icon, tone }) => (
          <div key={label} className="premium-card p-4">
            <Icon aria-hidden="true" className={`size-5 ${tone}`} />
            <p className="mt-3 text-xs font-semibold text-slate-600">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {view.canManageCoverage ? (
        <section className="premium-card p-4 sm:p-5" aria-labelledby="assign-attendance-duty-title">
          <div>
            <h2 id="assign-attendance-duty-title" className="text-lg font-semibold text-slate-950">Assign Attendance Duty</h2>
            <p className="mt-1 text-sm text-slate-600">Use a temporary assignment when the usual class teacher cannot mark attendance.</p>
          </div>
          <form action={createAction} className="mt-5 grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="attendanceDate" value={view.attendanceDate} />
            <label className="text-sm font-semibold text-slate-700">
              Class and section
              <select name="classSectionId" required className="mt-2 min-h-11 w-full">
                <option value="">Choose class</option>
                {view.classes.map((item) => <option key={item.classSectionId} value={item.classSectionId}>{item.classSectionName}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Staff member
              <select name="assignedUserId" required className="mt-2 min-h-11 w-full">
                <option value="">Choose staff member</option>
                {view.candidates.map((candidate) => (
                  <option key={candidate.userId} value={candidate.userId}>
                    {candidate.displayName} · {candidate.employeeCode} · {candidate.roleCodes.join(", ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Duty type
              <select name="assignmentType" required defaultValue="SUBSTITUTE_TEACHER" className="mt-2 min-h-11 w-full">
                <option value="CO_CLASS_TEACHER">Co-class teacher</option>
                <option value="SUBSTITUTE_TEACHER">Substitute teacher</option>
                <option value="PERIOD_TEACHER">Period teacher</option>
                <option value="ATTENDANCE_OPERATOR">Attendance operator</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Reason category
              <select name="reasonCode" required defaultValue="CLASS_TEACHER_UNAVAILABLE" className="mt-2 min-h-11 w-full">
                <option value="CLASS_TEACHER_UNAVAILABLE">Class teacher unavailable</option>
                <option value="APPROVED_LEAVE">Approved leave</option>
                <option value="TIMETABLE_COVERAGE">Timetable coverage</option>
                <option value="URGENT_MANUAL_COVERAGE">Urgent manual coverage</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700 lg:col-span-2">
              Reason and instructions
              <textarea name="reasonText" minLength={5} maxLength={500} required rows={3} className="mt-2 w-full" placeholder="Explain why coverage is needed and any instructions for the assigned staff member." />
            </label>
            <label className="inline-flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
              <input type="checkbox" name="replaceExisting" className="size-5" />
              Replace an existing active duty for this class and date
            </label>
            <div className="flex items-end lg:justify-end">
              <button type="submit" disabled={creating} className="premium-primary-button min-h-11 w-full lg:w-auto premium-focus">
                {creating ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
                {creating ? "Assigning..." : "Assign Duty"}
              </button>
            </div>
          </form>
          <div className="mt-4"><ActionMessage state={createState} /></div>
        </section>
      ) : null}

      <section aria-label="Class attendance coverage" className="grid gap-4 xl:grid-cols-2">
        {view.classes.map((item) => (
          <article key={item.classSectionId} className="premium-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-950">{item.classSectionName}</h2>
                <p className="mt-1 text-sm text-slate-600">Class teacher: {item.classTeacherName ?? "Not assigned"}</p>
              </div>
              <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${item.coverageState === "COMPLETED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : item.coverageState === "NEEDS_COVERAGE" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-indigo-200 bg-indigo-50 text-indigo-800"}`}>
                {item.coverageState === "CLASS_TEACHER" ? "Class teacher" : item.coverageState === "COVERED" ? "Duty assigned" : item.coverageState === "COMPLETED" ? "Completed" : "Needs coverage"}
              </span>
            </div>
            {item.duty ? (
              <dl className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-semibold text-slate-500">Assigned to</dt><dd className="mt-1 font-medium text-slate-900">{item.duty.assignedUserName}</dd></div>
                <div><dt className="text-xs font-semibold text-slate-500">Duty</dt><dd className="mt-1 font-medium text-slate-900">{item.duty.assignmentLabel} · {item.duty.status}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">Reason</dt><dd className="mt-1 text-slate-800">{item.duty.reasonText ?? "No additional instructions"}</dd></div>
              </dl>
            ) : null}
            {item.responsibleUserName ? <p className="mt-3 text-sm text-slate-700">Session responsibility: <span className="font-semibold">{item.responsibleUserName}</span></p> : null}
            {item.canOpenAttendance ? (
              <div className="mt-4">
                <Link href={`/academia/attendance/mark?date=${view.attendanceDate}&classSectionId=${item.classSectionId}`} className="premium-secondary-button min-h-11 w-full sm:w-auto premium-focus">
                  Open Attendance
                </Link>
              </div>
            ) : item.duty?.isMine && item.duty.status === "PENDING" ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Acknowledge this duty before opening the attendance register.
              </p>
            ) : null}
            <DutyActions item={item} canManageCoverage={view.canManageCoverage} />
          </article>
        ))}
        {view.classes.length === 0 ? (
          <div className="premium-card p-6 text-sm text-slate-600 xl:col-span-2">No class attendance responsibilities are available for this date.</div>
        ) : null}
      </section>
    </div>
  );
}
