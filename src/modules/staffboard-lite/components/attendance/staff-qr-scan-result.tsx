import { CheckCircle2 } from "lucide-react";
import type { StaffQrScanActionData } from "@/modules/staffboard-lite/actions/staff-qr-scan.actions";
import {
  formatStaffAttendanceStatus,
  formatStaffQrPurpose,
  formatStaffScanDateTime
} from "./staff-qr-scan-state";

type StaffQrScanResultProps = {
  result: StaffQrScanActionData;
  userName: string;
  institutionName: string;
  branchName: string;
  timeZone?: string;
};

export function StaffQrScanResult({
  result,
  userName,
  institutionName,
  branchName,
  timeZone
}: StaffQrScanResultProps) {
  const recordedAt = result.purpose === "CHECK_IN" ? result.checkInAt : result.checkOutAt;
  const rows = [
    { label: "Purpose", value: formatStaffQrPurpose(result.purpose) },
    { label: "Staff member", value: userName },
    { label: "Institution", value: institutionName },
    { label: "Branch", value: branchName },
    { label: "Attendance date", value: result.attendanceDate },
    { label: "Recorded at", value: formatStaffScanDateTime(recordedAt, timeZone) },
    { label: "Status", value: formatStaffAttendanceStatus(result.status) },
    { label: "Check-in", value: formatStaffScanDateTime(result.checkInAt, timeZone) },
    { label: "Check-out", value: formatStaffScanDateTime(result.checkOutAt, timeZone) },
    { label: "Working minutes", value: typeof result.workingMinutes === "number" ? String(result.workingMinutes) : "-" }
  ];

  return (
    <section
      className="motion-fade-in rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-soft sm:p-5"
      aria-labelledby="staff-scan-result-title"
      aria-live="polite"
      data-staff-qr-confirmation="true"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Attendance confirmed</p>
          <h2 id="staff-scan-result-title" className="mt-1 text-lg font-semibold text-emerald-950">
            {result.message}
          </h2>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-emerald-100 bg-white/[0.88] p-3 shadow-sm">
            <dt className="text-xs font-semibold uppercase text-emerald-700">{row.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-950">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
