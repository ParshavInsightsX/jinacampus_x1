"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Clock3, Loader2, ScanLine, Square, UserRoundCheck, XCircle } from "lucide-react";
import {
  closeStaffAttendanceScanSessionAction,
  recordSupervisedStaffQrScanAction,
  startStaffAttendanceScanSessionAction
} from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";
import type { SupervisedStaffScanResult } from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";
import { StaffQrCameraScanner } from "./staff-qr-camera-scanner";
import { StaffQrManualTokenInput } from "./staff-qr-manual-token-input";

type BranchOption = { id: string; name: string; code: string; timezone: string };
type SessionState = {
  id: string;
  branchId: string;
  mode: "AUTO" | "CHECK_IN" | "CHECK_OUT" | "CHECK_IN_ONLY";
  status: string;
  startedAt: Date | string;
  expiresAt: Date | string;
};

type StaffAttendanceOperatorScannerProps = {
  branchOptions: BranchOption[];
  defaultBranchId: string;
};

const errorMessages: Record<string, string> = {
  STAFF_ATTENDANCE_QR_INVALID: "This is not a valid staff attendance QR card.",
  STAFF_ATTENDANCE_CREDENTIAL_INACTIVE: "This staff QR card is no longer active. Ask an authorised user to issue a new card.",
  STAFF_ATTENDANCE_CREDENTIAL_EXPIRED: "This staff QR card has expired. Ask an authorised user to issue a new card.",
  STAFF_ATTENDANCE_WRONG_BRANCH: "This staff member is not assigned to the selected branch.",
  STAFF_ATTENDANCE_SCAN_SESSION_EXPIRED: "This scanner session has expired. Start a new session.",
  STAFF_ATTENDANCE_SCAN_TOO_SOON: "This QR card was scanned too quickly. Wait a moment and try again.",
  STAFF_ALREADY_CHECKED_IN: "This staff member is already checked in for today.",
  STAFF_ALREADY_CHECKED_OUT: "This staff member is already checked out for today.",
  STAFF_ATTENDANCE_ALREADY_RECORDED: "Check-in and check-out are already recorded for this staff member.",
  STAFF_CHECK_IN_REQUIRED: "Check-in must be recorded before check-out.",
  STAFF_ATTENDANCE_PERIOD_LOCKED: "Attendance for this date is locked.",
  STAFF_ATTENDANCE_MANAGED_BY_LEAVE: "Approved leave already applies to this staff member today. Use Attendance Correction if review is required."
};

function displayError(code: string, fallback: string) {
  return errorMessages[code] ?? fallback;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

export function StaffAttendanceOperatorScanner({
  branchOptions,
  defaultBranchId
}: StaffAttendanceOperatorScannerProps) {
  const submissionLock = useRef(false);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [mode, setMode] = useState<SessionState["mode"]>("AUTO");
  const [session, setSession] = useState<SessionState | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [result, setResult] = useState<SupervisedStaffScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  function beginSession() {
    if (isPending) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await startStaffAttendanceScanSessionAction({ branchId, mode });
      if (!response.ok) {
        setError(displayError(response.code, response.error));
        return;
      }
      setSession(response.data);
      setScannerKey((value) => value + 1);
    });
  }

  function stopSession() {
    if (!session || isPending) return;
    startTransition(async () => {
      const response = await closeStaffAttendanceScanSessionAction({
        sessionId: session.id,
        reason: "Operator ended attendance marking"
      });
      if (!response.ok) {
        setError(displayError(response.code, response.error));
        return;
      }
      setSession(null);
      setResult(null);
      setManualPayload("");
      setScannerKey((value) => value + 1);
    });
  }

  function submitPayload(qrPayload: string) {
    if (!session || submissionLock.current || isPending) return;
    const payload = qrPayload.trim();
    if (!payload) {
      setError("Scan a staff QR card or enter its token before submitting.");
      return;
    }

    submissionLock.current = true;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await recordSupervisedStaffQrScanAction({
          sessionId: session.id,
          qrPayload: payload,
          clientRequestId: crypto.randomUUID()
        });
        setManualPayload("");
        if (!response.ok) {
          setError(displayError(response.code, response.error));
          return;
        }
        setResult(response.data);
      } catch {
        setError("Attendance could not be verified. Check the connection and try again.");
      } finally {
        submissionLock.current = false;
      }
    });
  }

  function scanNext() {
    setResult(null);
    setError(null);
    setScannerKey((value) => value + 1);
  }

  if (!session) {
    return (
      <section className="attendance-glass-panel p-4 sm:p-6" aria-labelledby="scanner-setup-title">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
            <ScanLine className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="scanner-setup-title" className="text-lg font-semibold text-slate-950">Start attendance marking</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Choose the branch and scan mode, then scan each staff member's QR card.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Branch
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={isPending} className="min-h-12">
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Attendance action
            <select value={mode} onChange={(event) => setMode(event.target.value as SessionState["mode"])} disabled={isPending} className="min-h-12">
              <option value="AUTO">Automatic check-in / check-out</option>
              <option value="CHECK_IN">Check-in only</option>
              <option value="CHECK_OUT">Check-out only</option>
              <option value="CHECK_IN_ONLY">Single daily check-in</option>
            </select>
          </label>
        </div>

        {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">{error}</p> : null}
        <button type="button" onClick={beginSession} disabled={isPending || !branchId} className="premium-primary-button mt-5 min-h-12 w-full gap-2 premium-focus sm:w-auto">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
          {isPending ? "Starting scanner..." : "Begin Attendance"}
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="attendance-glass-bar flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Active scanner session">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">Scanner active</span>
          <p className="truncate text-sm text-slate-600">{branchOptions.find((branch) => branch.id === session.branchId)?.name} · {mode.replaceAll("_", " ")}</p>
        </div>
        <button type="button" onClick={stopSession} disabled={isPending} className="premium-secondary-button min-h-11 w-full gap-2 premium-focus sm:w-auto">
          <Square className="h-4 w-4" aria-hidden="true" /> Stop Session
        </button>
      </section>

      {result ? (
        <section className="attendance-glass-panel border-emerald-200 p-5" aria-live="polite" aria-labelledby="scan-result-title">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-700">{result.eventType === "CHECK_IN" ? "Check-In Recorded" : "Check-Out Recorded"}</p>
              <h2 id="scan-result-title" className="mt-1 text-xl font-semibold text-slate-950">{result.staffName}</h2>
              <p className="mt-1 text-sm text-slate-600">Employee Code {result.employeeCode}</p>
            </div>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Status</dt><dd className="mt-1 font-semibold text-slate-950">{result.status.replaceAll("_", " ")}</dd></div>
            <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Time</dt><dd className="mt-1 font-semibold text-slate-950">{formatTime(result.occurredAt)}</dd></div>
            <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Branch</dt><dd className="mt-1 font-semibold text-slate-950">{result.branchName}</dd></div>
            <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Working Time</dt><dd className="mt-1 font-semibold text-slate-950">{result.workingMinutes === null ? "In progress" : `${result.workingMinutes} min`}</dd></div>
          </dl>
          <button type="button" onClick={scanNext} className="premium-primary-button mt-5 min-h-12 w-full gap-2 premium-focus sm:w-auto">
            <ScanLine className="h-4 w-4" aria-hidden="true" /> Scan Next Staff Member
          </button>
        </section>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <StaffQrCameraScanner
            key={scannerKey}
            disabled={isPending}
            processing={isPending}
            variant="mobile"
            title="Scan Staff QR Card"
            description="Hold the staff member's printed QR card inside the square. Attendance is recorded automatically after verification."
            onQrPayloadDetected={submitPayload}
          />
          <aside className="space-y-4">
            <section id="manual-qr-entry" className="attendance-glass-panel p-4" aria-labelledby="manual-entry-title">
              <h2 id="manual-entry-title" className="font-semibold text-slate-950">Enter QR token manually</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Use this only when the camera cannot read the staff QR card.</p>
              <div className="mt-4">
                <StaffQrManualTokenInput value={manualPayload} disabled={isPending} compact onChange={setManualPayload} />
              </div>
              <button type="button" onClick={() => submitPayload(manualPayload)} disabled={isPending || !manualPayload.trim()} className="premium-primary-button mt-4 min-h-12 w-full gap-2 premium-focus">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserRoundCheck className="h-4 w-4" aria-hidden="true" />}
                {isPending ? "Recording..." : "Record Attendance"}
              </button>
            </section>
            <section className="attendance-glass-inset p-4">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
                <div><p className="font-semibold text-slate-900">Session expiry</p><p className="mt-1 text-sm text-slate-600">This scanner session ends at {formatTime(String(session.expiresAt))}. Start a new session after expiry.</p></div>
              </div>
            </section>
          </aside>
        </div>
      )}

      {error ? (
        <div role="alert" className="attendance-glass-panel border-rose-200 p-4 text-rose-900">
          <div className="flex gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">Attendance was not recorded</p><p className="mt-1 text-sm leading-6">{error}</p><button type="button" onClick={scanNext} className="premium-secondary-button mt-3 min-h-11 premium-focus">Try Again</button></div></div>
        </div>
      ) : null}
    </div>
  );
}