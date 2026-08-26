"use client";

import { useState, useTransition } from "react";
import { ClipboardEdit, Loader2 } from "lucide-react";
import { requestStaffAttendanceAdjustmentAction } from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";
import {
  formatStaffAttendanceDate,
  formatStaffAttendanceDateTime,
  formatStaffAttendanceLabel,
  formatWorkingMinutes,
  institutionalDateTimeLocalToIso,
  toDateTimeLocalValue
} from "./staff-attendance-admin-state";

type StaffAttendanceCorrectionFormProps = {
  attendanceRecordId: string;
  employeeCode: string;
  staffName: string;
  attendanceDate: string;
  currentStatus: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingMinutes: number | null;
  correctionReason: string | null;
  timeZone: string;
};

export function StaffAttendanceCorrectionForm({
  attendanceRecordId,
  employeeCode,
  staffName,
  attendanceDate,
  currentStatus,
  checkInAt,
  checkOutAt,
  workingMinutes,
  correctionReason: existingCorrectionReason,
  timeZone
}: StaffAttendanceCorrectionFormProps) {
  const [adjustmentType, setAdjustmentType] = useState(checkInAt ? (checkOutAt ? "SET_PRESENT" : "ADD_CHECK_OUT") : "ADD_CHECK_IN");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalValue(adjustmentType === "ADD_CHECK_OUT" ? checkOutAt : checkInAt, timeZone));
  const [reasonCode, setReasonCode] = useState("MISSED_SCAN");
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsTime = adjustmentType === "ADD_CHECK_IN" || adjustmentType === "ADD_CHECK_OUT";

  function submitRequest() {
    setMessage(null);
    setError(null);
    setReasonError(null);
    if (reasonText.trim().length < 5) {
      setReasonError("Write a short, verified reason.");
      return;
    }
    if (needsTime && !occurredAt) return setError("Select the attendance time.");
    startTransition(async () => {
      const response = await requestStaffAttendanceAdjustmentAction({
        attendanceRecordId,
        adjustmentType,
        ...(needsTime ? { occurredAt: institutionalDateTimeLocalToIso(occurredAt, timeZone) } : {}),
        reasonCode,
        reasonText: reasonText.trim()
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      setReasonText("");
    });
  }

  return (
    <details className="w-[22rem] max-w-[85vw] rounded-lg border border-white/80 bg-white/75 p-3 shadow-lg backdrop-blur-xl">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-brand-700 premium-focus"><ClipboardEdit className="h-4 w-4" aria-hidden="true" />Request Correction</summary>
      <div className="mt-3 space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs leading-5 text-amber-900">Corrections are audit logged. Your request will not change attendance until another authorised user verifies and approves it.</p>
        <dl className="grid gap-2 rounded-lg border border-slate-200 bg-white/60 p-3 text-xs">
          <div><dt className="font-semibold text-slate-500">Staff</dt><dd className="mt-0.5 text-slate-800">{employeeCode} · {staffName}</dd></div>
          <div><dt className="font-semibold text-slate-500">Date and Status</dt><dd className="mt-0.5 text-slate-800">{formatStaffAttendanceDate(attendanceDate, timeZone)} · {formatStaffAttendanceLabel(currentStatus)}</dd></div>
          <div><dt className="font-semibold text-slate-500">Recorded Time</dt><dd className="mt-0.5 text-slate-800">{formatStaffAttendanceDateTime(checkInAt, timeZone)} to {formatStaffAttendanceDateTime(checkOutAt, timeZone)} · {formatWorkingMinutes(workingMinutes)}</dd></div>
          {existingCorrectionReason ? <div><dt className="font-semibold text-slate-500">Previous Note</dt><dd className="mt-0.5 text-slate-800">{existingCorrectionReason}</dd></div> : null}
        </dl>
        <label className="grid gap-2 text-xs font-semibold text-slate-700">Requested change<select value={adjustmentType} onChange={(event) => { setAdjustmentType(event.target.value); setOccurredAt(""); }} disabled={isPending} className="min-h-11"><option value="ADD_CHECK_IN">Add Missing Check-In</option><option value="ADD_CHECK_OUT">Add Missing Check-Out</option><option value="SET_PRESENT">Mark Present</option><option value="SET_ABSENT">Mark Absent</option><option value="SET_HALF_DAY">Mark Half Day</option><option value="SET_ON_LEAVE">Mark On Leave</option><option value="SET_OFFICIAL_DUTY">Mark Official Duty</option><option value="ADD_NOTE">Add Attendance Note</option></select></label>
        {needsTime ? <label className="grid gap-2 text-xs font-semibold text-slate-700">Attendance time<input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} disabled={isPending} className="min-h-11" /></label> : null}
        <label className="grid gap-2 text-xs font-semibold text-slate-700">Reason category<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} disabled={isPending} className="min-h-11"><option value="MISSED_SCAN">Missed QR Scan</option><option value="INCORRECT_STATUS">Incorrect Status</option><option value="DEVICE_UNAVAILABLE">Scanner Unavailable</option><option value="OFFICIAL_DUTY">Official Duty</option><option value="OTHER">Other</option></select></label>
        <label className="grid gap-2 text-xs font-semibold text-slate-700">
          Correction reason
          <textarea
            value={reasonText}
            onChange={(event) => {
              setReasonText(event.target.value);
              if (reasonError) setReasonError(null);
            }}
            disabled={isPending}
            rows={3}
            maxLength={1000}
            aria-invalid={Boolean(reasonError)}
            aria-describedby="attendance-correction-reason-help attendance-correction-reason-error"
            placeholder="Explain what was verified and what should change."
          />
        </label>
        <p id="attendance-correction-reason-help" className="text-xs text-slate-500">Write a short, verified reason.</p>
        {reasonError ? <p id="attendance-correction-reason-error" role="alert" className="text-sm font-medium text-rose-700">{reasonError}</p> : null}
        {message ? <p role="status" className="text-sm font-medium text-emerald-700">{message}</p> : null}
        {error ? <p role="alert" className="text-sm font-medium text-rose-700">{error}</p> : null}
        <button type="button" onClick={submitRequest} disabled={isPending} className="premium-primary-button min-h-11 w-full gap-2 premium-focus">{isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardEdit className="h-4 w-4" aria-hidden="true" />}{isPending ? "Sending..." : "Send for Approval"}</button>
      </div>
    </details>
  );
}