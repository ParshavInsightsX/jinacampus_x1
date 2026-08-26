"use client";

import { useState, useTransition } from "react";
import { Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { reviewStaffAttendanceAdjustmentAction } from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";

type AdjustmentRow = {
  id: string;
  adjustmentType: string;
  reasonCode: string;
  reasonText: string;
  requestedAt: Date | string;
  staff: {
    id: string;
    employeeCode: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
  };
  attendanceRecord: {
    attendanceDate: Date | string;
    status: string;
    checkInAt: Date | string | null;
    checkOutAt: Date | string | null;
  };
  requestedBy: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string | null;
  };
};

type StaffAttendanceAdjustmentReviewProps = { rows: AdjustmentRow[]; timeZone: string };

const labels: Record<string, string> = {
  ADD_CHECK_IN: "Add Check-In",
  ADD_CHECK_OUT: "Add Check-Out",
  SET_PRESENT: "Mark Present",
  SET_ABSENT: "Mark Absent",
  SET_HALF_DAY: "Mark Half Day",
  SET_ON_LEAVE: "Mark On Leave",
  SET_OFFICIAL_DUTY: "Mark Official Duty",
  CORRECT_EVENT_TIME: "Correct Attendance Time",
  VOID_EVENT: "Cancel Incorrect Event",
  ADD_NOTE: "Add Attendance Note"
};

function name(parts: Array<string | null>) { return parts.filter(Boolean).join(" "); }
function formatDate(value: Date | string, timeZone: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone }).format(new Date(value)); }
function formatDateTime(value: Date | string, timeZone: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)); }

function ReviewCard({ row, timeZone }: { row: AdjustmentRow; timeZone: string }) {
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(decision: "APPROVE" | "REJECT") {
    setMessage(null);
    setError(null);
    if (comment.trim().length < 3) return setError("Enter a review note of at least 3 characters.");
    startTransition(async () => {
      const response = await reviewStaffAttendanceAdjustmentAction({
        adjustmentId: row.id,
        decision,
        reviewComment: comment.trim()
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      window.location.reload();
    });
  }

  return (
    <article className="attendance-glass-panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-brand-700">{labels[row.adjustmentType] ?? row.adjustmentType.replaceAll("_", " ")}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{name([row.staff.firstName, row.staff.middleName, row.staff.lastName])}</h2>
          <p className="mt-1 text-sm text-slate-600">Employee Code {row.staff.employeeCode} · {formatDate(row.attendanceRecord.attendanceDate, timeZone)}</p>
        </div>
        <span className="inline-flex min-h-8 items-center self-start rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800">Pending Approval</span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Current Status</dt><dd className="mt-1 font-medium text-slate-950">{row.attendanceRecord.status.replaceAll("_", " ")}</dd></div>
        <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Reason Category</dt><dd className="mt-1 font-medium text-slate-950">{row.reasonCode.replaceAll("_", " ")}</dd></div>
        <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Requested By</dt><dd className="mt-1 font-medium text-slate-950">{row.requestedBy.displayName ?? name([row.requestedBy.firstName, row.requestedBy.lastName])}</dd></div>
        <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Requested At</dt><dd className="mt-1 font-medium text-slate-950">{formatDateTime(row.requestedAt, timeZone)}</dd></div>
      </dl>
      <div className="mt-4 rounded-lg border border-slate-200/80 bg-white/50 p-3"><p className="text-xs font-semibold text-slate-500">Request Note</p><p className="mt-1 text-sm leading-6 text-slate-800">{row.reasonText}</p></div>
      <label className="mt-4 grid gap-2 text-sm font-medium text-slate-800">Review note<textarea value={comment} onChange={(event) => setComment(event.target.value)} disabled={isPending} rows={3} maxLength={1000} placeholder="Record what you verified before deciding." /></label>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      {message ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
      <div className="mt-4 grid gap-3 sm:flex">
        <button type="button" onClick={() => decide("APPROVE")} disabled={isPending} className="premium-primary-button min-h-12 w-full gap-2 premium-focus sm:w-auto">{isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Approve and Apply</button>
        <button type="button" onClick={() => decide("REJECT")} disabled={isPending} className="premium-danger-button min-h-12 w-full gap-2 premium-focus sm:w-auto"><X className="h-4 w-4" aria-hidden="true" />Reject Request</button>
      </div>
    </article>
  );
}

export function StaffAttendanceAdjustmentReview({ rows, timeZone }: StaffAttendanceAdjustmentReviewProps) {
  if (rows.length === 0) return <section className="attendance-glass-panel p-8 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-emerald-600" aria-hidden="true" /><h2 className="mt-3 font-semibold text-slate-950">No attendance corrections waiting</h2><p className="mt-2 text-sm text-slate-600">New manual attendance and correction requests will appear here.</p></section>;
  return <div className="space-y-4">{rows.map((row) => <ReviewCard key={row.id} row={row} timeZone={timeZone} />)}</div>;
}