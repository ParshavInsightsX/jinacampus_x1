"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  ScanLine,
  Settings2,
  ShieldAlert,
  Square,
  UserRoundCheck,
  WifiOff,
  XCircle
} from "lucide-react";
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

type StationState =
  | "INITIALISING"
  | "READY"
  | "QR_DETECTED"
  | "PROCESSING"
  | "SUCCESS"
  | "WARNING"
  | "ERROR"
  | "REARMING"
  | "SESSION_EXPIRED"
  | "NETWORK_UNAVAILABLE"
  | "STOPPED";

type NoticeTone = "ready" | "success" | "warning" | "error";
type StationNotice = {
  tone: NoticeTone;
  title: string;
  description: string;
};

type StaffAttendanceOperatorScannerProps = {
  branchOptions: BranchOption[];
  defaultBranchId: string;
};

const RESULT_DISPLAY_MS = 2_000;

const errorMessages: Record<string, string> = {
  STAFF_ATTENDANCE_QR_INVALID: "Use the Attendance QR shown in JinaCampus under My Attendance.",
  STAFF_ATTENDANCE_CREDENTIAL_INACTIVE: "This Attendance QR is inactive. Ask an authorised user to issue a new one.",
  STAFF_ATTENDANCE_CREDENTIAL_EXPIRED: "This Attendance QR has expired. Ask an authorised user to issue a replacement.",
  STAFF_ATTENDANCE_WRONG_BRANCH: "Attendance cannot be recorded at this branch.",
  STAFF_ATTENDANCE_SCAN_SESSION_EXPIRED: "The attendance session has expired.",
  STAFF_ATTENDANCE_SCAN_TOO_SOON: "This attendance was processed recently. Remove the QR briefly before trying again.",
  STAFF_ALREADY_CHECKED_IN: "Check-in has already been recorded for today.",
  STAFF_ALREADY_CHECKED_OUT: "Check-out has already been recorded for today.",
  STAFF_ATTENDANCE_ALREADY_RECORDED: "Attendance has already been recorded for today.",
  STAFF_CHECK_IN_REQUIRED: "Check-in must be recorded before check-out.",
  STAFF_ATTENDANCE_PERIOD_LOCKED: "Attendance for this date is locked.",
  STAFF_ATTENDANCE_MANAGED_BY_LEAVE: "Approved leave already applies today. Use Attendance Correction if review is required."
};

const warningCodes = new Set([
  "STAFF_ATTENDANCE_SCAN_TOO_SOON",
  "STAFF_ALREADY_CHECKED_IN",
  "STAFF_ALREADY_CHECKED_OUT",
  "STAFF_ATTENDANCE_ALREADY_RECORDED",
  "STAFF_CHECK_IN_REQUIRED",
  "STAFF_ATTENDANCE_PERIOD_LOCKED",
  "STAFF_ATTENDANCE_MANAGED_BY_LEAVE"
]);

function displayError(code: string, fallback: string) {
  return errorMessages[code] ?? fallback;
}

function formatTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timeZone ? { timeZone } : {})
  }).format(new Date(value));
}

function formatMode(mode: SessionState["mode"]) {
  if (mode === "AUTO") return "Automatic check-in / check-out";
  if (mode === "CHECK_IN") return "Check-in only";
  if (mode === "CHECK_OUT") return "Check-out only";
  return "Single daily check-in";
}

function resultNotice(result: SupervisedStaffScanResult, timeZone?: string): StationNotice {
  if (result.duplicateRequest) {
    return {
      tone: "warning",
      title: "Already processed",
      description: result.staffName + " · " + (result.eventType === "CHECK_IN" ? "Check-in" : "Check-out")
    };
  }

  return {
    tone: "success",
    title: "Attendance recorded",
    description:
      result.staffName +
      " · " +
      (result.eventType === "CHECK_IN" ? "Check-in" : "Check-out") +
      " " +
      formatTime(result.occurredAt, timeZone)
  };
}

function noticeIcon(tone: NoticeTone) {
  if (tone === "success") return <CheckCircle2 className="h-6 w-6" aria-hidden="true" />;
  if (tone === "warning") return <AlertTriangle className="h-6 w-6" aria-hidden="true" />;
  if (tone === "error") return <XCircle className="h-6 w-6" aria-hidden="true" />;
  return <ScanLine className="h-6 w-6" aria-hidden="true" />;
}

function noticeClasses(tone: NoticeTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50/95 text-emerald-950";
  if (tone === "warning") return "border-amber-200 bg-amber-50/95 text-amber-950";
  if (tone === "error") return "border-rose-200 bg-rose-50/95 text-rose-950";
  return "border-cyan-200 bg-cyan-50/95 text-cyan-950";
}

export function StaffAttendanceOperatorScanner({
  branchOptions,
  defaultBranchId
}: StaffAttendanceOperatorScannerProps) {
  const submissionLock = useRef(false);
  const sessionStartLock = useRef(false);
  const automaticStartAttempted = useRef(false);
  const rearmTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionRef = useRef<SessionState | null>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [mode, setMode] = useState<SessionState["mode"]>("AUTO");
  const [session, setSession] = useState<SessionState | null>(null);
  const [manualPayload, setManualPayload] = useState("");
  const [result, setResult] = useState<SupervisedStaffScanResult | null>(null);
  const [notice, setNotice] = useState<StationNotice>({
    tone: "ready",
    title: "Preparing Staff Attendance",
    description: "Validating the branch scanner session."
  });
  const [stationState, setStationState] = useState<StationState>("INITIALISING");
  const [rearmSignal, setRearmSignal] = useState(0);
  const [isPending, startTransition] = useTransition();

  const clearRearmTimer = useCallback(() => {
    if (rearmTimeoutRef.current !== null) {
      window.clearTimeout(rearmTimeoutRef.current);
      rearmTimeoutRef.current = null;
    }
  }, []);

  const scheduleRearm = useCallback(() => {
    clearRearmTimer();
    rearmTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current || !sessionRef.current) return;
      setStationState("REARMING");
      setResult(null);
      setNotice({
        tone: "ready",
        title: "Ready to scan",
        description: "Present the next staff Attendance QR."
      });
      setRearmSignal((value) => value + 1);
      setStationState("READY");
    }, RESULT_DISPLAY_MS);
  }, [clearRearmTimer]);

  function activateSession(nextSession: SessionState) {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStationState("READY");
    setNotice({
      tone: "ready",
      title: "Ready to scan",
      description: "Present a staff Attendance QR inside the square."
    });
    setRearmSignal((value) => value + 1);
  }

  function beginSession() {
    if (sessionStartLock.current) return;
    sessionStartLock.current = true;
    clearRearmTimer();
    setResult(null);
    setStationState("INITIALISING");
    setNotice({
      tone: "ready",
      title: "Preparing Staff Attendance",
      description: "Validating the branch scanner session."
    });

    startTransition(async () => {
      try {
        const response = await startStaffAttendanceScanSessionAction({ branchId, mode });
        if (!mountedRef.current) return;
        if (!response.ok) {
          setStationState("ERROR");
          setNotice({
            tone: "error",
            title: "Scanner could not start",
            description: displayError(response.code, response.error)
          });
          return;
        }
        activateSession(response.data);
      } catch {
        if (!mountedRef.current) return;
        setStationState("NETWORK_UNAVAILABLE");
        setNotice({
          tone: "error",
          title: "Scanner not connected",
          description: "The attendance session could not be confirmed. Check the connection and retry."
        });
      } finally {
        sessionStartLock.current = false;
      }
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    if (!automaticStartAttempted.current) {
      automaticStartAttempted.current = true;
      beginSession();
    }
    return () => {
      mountedRef.current = false;
      clearRearmTimer();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const expiresIn = new Date(session.expiresAt).getTime() - Date.now();
    if (expiresIn <= 0) {
      setStationState("SESSION_EXPIRED");
      setNotice({ tone: "error", title: "Attendance session expired", description: "Restart the scanner to continue." });
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setStationState("SESSION_EXPIRED");
      setNotice({ tone: "error", title: "Attendance session expired", description: "Restart the scanner to continue." });
    }, Math.min(expiresIn, 2_147_000_000));
    return () => window.clearTimeout(timeoutId);
  }, [session]);

  function stopSession() {
    const activeSession = sessionRef.current;
    if (!activeSession || isPending) return;
    clearRearmTimer();
    startTransition(async () => {
      try {
        const response = await closeStaffAttendanceScanSessionAction({
          sessionId: activeSession.id,
          reason: "Operator ended attendance marking"
        });
        if (!mountedRef.current) return;
        if (!response.ok) {
          setNotice({ tone: "error", title: "Scanner could not stop", description: displayError(response.code, response.error) });
          return;
        }
        sessionRef.current = null;
        setSession(null);
        setResult(null);
        setManualPayload("");
        setStationState("STOPPED");
        setNotice({ tone: "ready", title: "Scanner stopped", description: "Restart Staff Attendance when you are ready." });
      } catch {
        if (!mountedRef.current) return;
        setNotice({
          tone: "error",
          title: "Scanner could not stop",
          description: "The scanner session could not be closed. Check the connection and retry."
        });
      }
    });
  }

  function restartSession() {
    const activeSession = sessionRef.current;
    clearRearmTimer();
    sessionRef.current = null;
    setSession(null);
    setResult(null);
    setManualPayload("");
    if (!activeSession) {
      beginSession();
      return;
    }

    startTransition(async () => {
      try {
        await closeStaffAttendanceScanSessionAction({
          sessionId: activeSession.id,
          reason: "Operator restarted attendance scanner"
        });
      } finally {
        if (!mountedRef.current) return;
        sessionStartLock.current = false;
        beginSession();
      }
    });
  }

  const submitPayload = useCallback((qrPayload: string) => {
    const activeSession = sessionRef.current;
    if (!activeSession || submissionLock.current) return;
    if (new Date(activeSession.expiresAt).getTime() <= Date.now()) {
      setStationState("SESSION_EXPIRED");
      setNotice({ tone: "error", title: "Attendance session expired", description: "Restart the scanner to continue." });
      return;
    }
    const payload = qrPayload.trim();
    if (!payload) {
      setNotice({ tone: "error", title: "Attendance QR required", description: "Scan a staff Attendance QR or enter its token." });
      return;
    }

    submissionLock.current = true;
    clearRearmTimer();
    setResult(null);
    setStationState("QR_DETECTED");
    setNotice({ tone: "ready", title: "QR detected", description: "Processing attendance..." });
    setStationState("PROCESSING");

    startTransition(async () => {
      try {
        const scanFormData = new FormData();
        scanFormData.set("sessionId", activeSession.id);
        scanFormData.set("qrPayload", payload);
        scanFormData.set("clientRequestId", crypto.randomUUID());
        const response = await recordSupervisedStaffQrScanAction(scanFormData);
        if (!mountedRef.current) return;
        setManualPayload("");
        if (!response.ok) {
          if (response.code === "STAFF_ATTENDANCE_SCAN_SESSION_EXPIRED") {
            setStationState("SESSION_EXPIRED");
            setNotice({ tone: "error", title: "Attendance session expired", description: displayError(response.code, response.error) });
            return;
          }
          const warning = warningCodes.has(response.code);
          setStationState(warning ? "WARNING" : "ERROR");
          setNotice({
            tone: warning ? "warning" : "error",
            title: warning ? "Already recorded" : "Attendance not recorded",
            description: displayError(response.code, response.error)
          });
          scheduleRearm();
          return;
        }
        setResult(response.data);
        const timeZone = branchOptions.find((branch) => branch.id === activeSession.branchId)?.timezone;
        const nextNotice = resultNotice(response.data, timeZone);
        setStationState(nextNotice.tone === "warning" ? "WARNING" : "SUCCESS");
        setNotice(nextNotice);
        scheduleRearm();
      } catch {
        if (!mountedRef.current) return;
        setStationState("NETWORK_UNAVAILABLE");
        setNotice({
          tone: "error",
          title: "Attendance not confirmed",
          description: "Connection unavailable. Remove the QR, check the connection, and scan again."
        });
        scheduleRearm();
      } finally {
        submissionLock.current = false;
      }
    });
  }, [branchOptions, clearRearmTimer, scheduleRearm]);

  const activeBranch = branchOptions.find((branch) => branch.id === session?.branchId);
  const scannerBlocked =
    !session ||
    stationState === "INITIALISING" ||
    stationState === "SESSION_EXPIRED" ||
    stationState === "STOPPED";
  const processing = stationState === "QR_DETECTED" || stationState === "PROCESSING";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4" data-continuous-staff-attendance-station="true">
      <section
        className={"rounded-lg border p-4 shadow-sm " + noticeClasses(notice.tone)}
        aria-live={notice.tone === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">{noticeIcon(notice.tone)}</span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">{notice.title}</p>
            <p className="mt-1 text-sm leading-6">{notice.description}</p>
            {result ? (
              <p className="mt-1 text-sm font-medium">
                Employee {result.employeeCode} · {result.branchName} · {result.status.replaceAll("_", " ")}
              </p>
            ) : null}
            {stationState === "SESSION_EXPIRED" ? (
              <button
                type="button"
                onClick={restartSession}
                disabled={isPending}
                className="premium-primary-button mt-3 min-h-11 gap-2 premium-focus"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
                Restart scanner
              </button>
            ) : null}
          </div>
          {processing ? <Loader2 className="ml-auto h-5 w-5 shrink-0 animate-spin" aria-label="Processing attendance" /> : null}
        </div>
      </section>

      {session ? (
        <div className="attendance-glass-bar flex flex-wrap items-center justify-between gap-3 px-3 py-2" aria-label="Active attendance scanner">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="inline-flex min-h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 font-semibold text-emerald-800">
              {stationState === "SESSION_EXPIRED" ? "Session expired" : "Scanner active"}
            </span>
            <span className="truncate text-slate-700">{activeBranch?.name ?? "Assigned branch"} · {formatMode(session.mode)}</span>
          </div>
          <button
            type="button"
            onClick={stopSession}
            disabled={isPending || processing}
            className="premium-secondary-button min-h-11 gap-2 premium-focus"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop scanner
          </button>
        </div>
      ) : null}

      {stationState === "INITIALISING" ? (
        <section className="attendance-glass-panel flex min-h-80 items-center justify-center p-6 text-center">
          <div>
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-brand-600" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">Preparing the scanner</h2>
            <p className="mt-2 text-sm text-slate-600">The camera will open automatically after the secure session is ready.</p>
          </div>
        </section>
      ) : session ? (
        <section className="attendance-glass-panel p-3 sm:p-5">
          <StaffQrCameraScanner
            autoStart
            continuous
            disabled={scannerBlocked}
            preferredFacingMode="user"
            processing={processing}
            rearmSignal={rearmSignal}
            showPrimaryControls={false}
            variant="mobile"
            title="Staff Attendance"
            description="Present the Attendance QR inside the square. The scanner records attendance and rearms automatically."
            onQrPayloadDetected={submitPayload}
          />
        </section>
      ) : (
        <section className="attendance-glass-panel p-5 text-center">
          {stationState === "NETWORK_UNAVAILABLE" ? (
            <WifiOff className="mx-auto h-8 w-8 text-rose-600" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={beginSession}
            disabled={isPending}
            className="premium-primary-button mx-auto mt-4 min-h-12 gap-2 premium-focus"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ScanLine className="h-4 w-4" aria-hidden="true" />}
            Restart Attendance Scanner
          </button>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <details id="manual-qr-entry" className="attendance-glass-panel p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-slate-900 premium-focus">
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
            Manual QR fallback
          </summary>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use this only when the camera cannot read the staff Attendance QR.</p>
          <div className="mt-4">
            <StaffQrManualTokenInput value={manualPayload} disabled={processing || scannerBlocked} compact onChange={setManualPayload} />
          </div>
          <button
            type="button"
            onClick={() => submitPayload(manualPayload)}
            disabled={processing || scannerBlocked || !manualPayload.trim()}
            className="premium-primary-button mt-4 min-h-12 w-full gap-2 premium-focus"
          >
            {processing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserRoundCheck className="h-4 w-4" aria-hidden="true" />}
            {processing ? "Recording..." : "Record attendance"}
          </button>
        </details>

        <details className="attendance-glass-panel p-4">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-slate-900 premium-focus">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Scanner settings
          </summary>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm font-medium text-slate-800">
              Branch
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)} disabled={isPending || processing} className="min-h-12">
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-800">
              Attendance action
              <select value={mode} onChange={(event) => setMode(event.target.value as SessionState["mode"])} disabled={isPending || processing} className="min-h-12">
                <option value="AUTO">Automatic check-in / check-out</option>
                <option value="CHECK_IN">Check-in only</option>
                <option value="CHECK_OUT">Check-out only</option>
                <option value="CHECK_IN_ONLY">Single daily check-in</option>
              </select>
            </label>
            <button type="button" onClick={restartSession} disabled={isPending || processing} className="premium-secondary-button min-h-11 gap-2 premium-focus">
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              Apply and restart scanner
            </button>
          </div>
        </details>
      </div>

      {session ? (
        <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Secure scanner session ends at {formatTime(String(session.expiresAt), activeBranch?.timezone)}.
        </p>
      ) : null}
    </div>
  );
}
