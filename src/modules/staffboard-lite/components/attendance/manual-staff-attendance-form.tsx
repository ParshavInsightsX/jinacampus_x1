"use client";

import { useState, useTransition } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { requestManualStaffAttendanceAction } from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";
import { institutionalDateTimeLocalToIso } from "./staff-attendance-admin-state";

type StaffOption = {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
  staffType: string;
};

type ManualStaffAttendanceFormProps = {
  branch: { id: string; name: string; code: string; timezone: string };
  staff: StaffOption[];
  defaultDate: string;
};

function nameOf(staff: StaffOption) {
  return [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ");
}


export function ManualStaffAttendanceForm({ branch, staff, defaultDate }: ManualStaffAttendanceFormProps) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [attendanceDate, setAttendanceDate] = useState(defaultDate);
  const [status, setStatus] = useState("PRESENT");
  const [checkInAt, setCheckInAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reasonCode, setReasonCode] = useState("MISSED_SCAN");
  const [reasonText, setReasonText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    setError(null);
    if (!staffId) return setError("Select a staff member.");
    if (reasonText.trim().length < 5) return setError("Enter a clear reason of at least 5 characters.");
    startTransition(async () => {
      const response = await requestManualStaffAttendanceAction({
        branchId: branch.id,
        staffId,
        attendanceDate,
        status,
        ...(checkInAt ? { checkInAt: institutionalDateTimeLocalToIso(checkInAt, branch.timezone) } : {}),
        ...(checkOutAt ? { checkOutAt: institutionalDateTimeLocalToIso(checkOutAt, branch.timezone) } : {}),
        reasonCode,
        reasonText: reasonText.trim()
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      setReasonText("");
      setCheckInAt("");
      setCheckOutAt("");
    });
  }

  return (
    <section className="attendance-glass-panel p-4 sm:p-5" aria-labelledby="manual-attendance-title">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><ClipboardPlus className="h-5 w-5" aria-hidden="true" /></span>
        <div><h2 id="manual-attendance-title" className="font-semibold text-slate-950">Manual Attendance Request</h2><p className="mt-1 text-sm leading-6 text-slate-600">Use only when QR attendance could not be recorded. A different authorised user must approve the request.</p></div>
      </div>
      {staff.length === 0 ? <p className="mt-4 text-sm text-slate-600">No active staff are assigned to {branch.name}.</p> : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium text-slate-800 sm:col-span-2 xl:col-span-1">Staff member<select value={staffId} onChange={(event) => setStaffId(event.target.value)} disabled={isPending} className="min-h-12"><option value="">Select staff</option>{staff.map((person) => <option key={person.id} value={person.id}>{nameOf(person)} · {person.employeeCode}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">Attendance date<input type="date" value={attendanceDate} onChange={(event) => setAttendanceDate(event.target.value)} disabled={isPending} className="min-h-12" /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">Attendance status<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={isPending} className="min-h-12"><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="HALF_DAY">Half Day</option><option value="ON_LEAVE">On Leave</option><option value="OFFICIAL_DUTY">Official Duty</option></select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">Check-in time (optional)<input type="datetime-local" value={checkInAt} onChange={(event) => setCheckInAt(event.target.value)} disabled={isPending} className="min-h-12" /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">Check-out time (optional)<input type="datetime-local" value={checkOutAt} onChange={(event) => setCheckOutAt(event.target.value)} disabled={isPending} className="min-h-12" /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">Reason category<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} disabled={isPending} className="min-h-12"><option value="MISSED_SCAN">Missed QR Scan</option><option value="DEVICE_UNAVAILABLE">Scanner Unavailable</option><option value="OFFICIAL_DUTY">Official Duty</option><option value="OPERATOR_ENTRY">Operator Entry</option><option value="OTHER">Other</option></select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-800 sm:col-span-2 xl:col-span-3">Reason and supporting note<textarea value={reasonText} onChange={(event) => setReasonText(event.target.value)} disabled={isPending} rows={3} maxLength={1000} placeholder="Explain why manual attendance is required." /></label>
        </div>
      )}
      {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">{error}</p> : null}
      {message ? <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800">{message}</p> : null}
      <button type="button" onClick={submit} disabled={isPending || staff.length === 0} className="premium-primary-button mt-5 min-h-12 w-full gap-2 premium-focus sm:w-auto">{isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ClipboardPlus className="h-4 w-4" aria-hidden="true" />}{isPending ? "Sending for approval..." : "Send for Approval"}</button>
    </section>
  );
}