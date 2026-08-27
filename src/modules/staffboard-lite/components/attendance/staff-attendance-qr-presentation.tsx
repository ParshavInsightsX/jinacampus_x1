"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, History, QrCode, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { pollMyStaffAttendanceQrAction } from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";
import type { StaffAttendanceIdentityCard } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";
import type {
  StaffAttendanceQrCredentialState,
  StaffAttendanceQrLiveState
} from "@/modules/staffboard-lite/services/staff-attendance-self.service";

type Attendance = StaffAttendanceQrLiveState["attendance"];

type AttendanceConfirmation = {
  eventType: "CHECK_IN" | "CHECK_OUT";
  occurredAt: string;
  attendance: NonNullable<Attendance>;
};

type StaffAttendanceQrPresentationProps = {
  card: StaffAttendanceIdentityCard;
  canMonitorAttendance: boolean;
  initialLiveState: StaffAttendanceQrLiveState | null;
  timeZone: string;
};

const POLL_INTERVAL_MS = 4_000;

function eventKey(attendance: Attendance) {
  return attendance ? attendance.checkOutAt ?? attendance.checkInAt ?? "" : "";
}

function formatAttendanceDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone
  }).format(new Date(value + "T12:00:00.000Z"));
}

function formatAttendanceTime(value: string | null, timeZone: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone
  }).format(new Date(value));
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function qrStateCopy(credentialState: StaffAttendanceQrCredentialState, attendance: Attendance) {
  if (credentialState === "EXPIRED") {
    return {
      code: "EXPIRED",
      label: "Attendance QR expired",
      description: "Ask your Principal to issue a replacement Attendance QR.",
      tone: "error" as const,
      showQr: false
    };
  }
  if (credentialState === "SUSPENDED") {
    return {
      code: "SUSPENDED",
      label: "Attendance QR unavailable",
      description: "This Attendance QR is inactive. Contact the school office.",
      tone: "error" as const,
      showQr: false
    };
  }
  if (credentialState === "UNAVAILABLE") {
    return {
      code: "UNAVAILABLE",
      label: "Attendance QR unavailable",
      description: "Your secure attendance status could not be verified. Keep this page open while JinaCampus retries.",
      tone: "warning" as const,
      showQr: false
    };
  }
  if (attendance?.checkInAt && attendance.checkOutAt) {
    return {
      code: "ATTENDANCE_RECORDED",
      label: "Attendance complete",
      description: "Today's check-in and check-out are already recorded.",
      tone: "success" as const,
      showQr: false
    };
  }
  if (attendance?.checkInAt) {
    return {
      code: "READY_FOR_CHECK_OUT",
      label: "Ready for check-out",
      description: "Show this Attendance QR to the authorised scanner when leaving.",
      tone: "ready" as const,
      showQr: true
    };
  }
  return {
    code: "READY_FOR_CHECK_IN",
    label: "Ready for check-in",
    description: "Show this Attendance QR to the authorised scanner when arriving.",
    tone: "ready" as const,
    showQr: true
  };
}

function statusClasses(tone: "ready" | "success" | "warning" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-cyan-200 bg-cyan-50 text-cyan-900";
}

export function StaffAttendanceQrPresentation({
  card,
  canMonitorAttendance,
  initialLiveState,
  timeZone
}: StaffAttendanceQrPresentationProps) {
  const pollInFlight = useRef(false);
  const attendanceRef = useRef<Attendance>(initialLiveState?.attendance ?? null);
  const [attendance, setAttendance] = useState<Attendance>(initialLiveState?.attendance ?? null);
  const [credentialState, setCredentialState] = useState<StaffAttendanceQrCredentialState>(
    initialLiveState?.credentialState ?? "ACTIVE"
  );
  const [confirmation, setConfirmation] = useState<AttendanceConfirmation | null>(null);
  const [monitorMessage, setMonitorMessage] = useState(
    canMonitorAttendance ? "Waiting for the authorised scanner to record attendance." : null
  );

  useEffect(() => {
    if (!canMonitorAttendance || confirmation) return;
    let intervalId: number | null = null;

    const poll = async () => {
      if (pollInFlight.current || document.visibilityState !== "visible") return;
      pollInFlight.current = true;
      try {
        const response = await pollMyStaffAttendanceQrAction({ credentialId: card.credentialId });
        if (!response.ok) {
          setCredentialState("UNAVAILABLE");
          setMonitorMessage("Attendance status could not be refreshed. JinaCampus will retry while this page is visible.");
          return;
        }

        const previous = attendanceRef.current;
        const next = response.data.attendance;
        attendanceRef.current = next;
        setAttendance(next);
        setCredentialState(response.data.credentialState);
        setMonitorMessage("Attendance status is updating automatically.");

        if (!next || eventKey(previous) === eventKey(next)) return;
        const eventType =
          next.checkOutAt && next.checkOutAt !== previous?.checkOutAt ? "CHECK_OUT" : "CHECK_IN";
        const occurredAt = eventType === "CHECK_OUT" ? next.checkOutAt : next.checkInAt;
        if (occurredAt) {
          setConfirmation({ eventType, occurredAt, attendance: next });
        }
      } catch {
        setCredentialState("UNAVAILABLE");
        setMonitorMessage("Attendance status could not be refreshed. JinaCampus will retry while this page is visible.");
      } finally {
        pollInFlight.current = false;
      }
    };

    const startPolling = () => {
      if (document.visibilityState !== "visible") return;
      void poll();
      if (intervalId === null) intervalId = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") startPolling();
      else stopPolling();
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canMonitorAttendance, card.credentialId, confirmation]);

  if (confirmation) {
    return (
      <section
        className="attendance-glass-panel mx-auto max-w-xl p-5 text-center sm:p-7"
        aria-live="assertive"
        aria-atomic="true"
        data-staff-attendance-confirmation="true"
      >
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-emerald-700">Attendance recorded</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">{card.staffName}</h2>
        <p className="mt-2 text-lg font-semibold text-slate-800">
          {confirmation.eventType === "CHECK_IN" ? "Check-in" : "Check-out"} · {formatAttendanceTime(confirmation.occurredAt, timeZone)}
        </p>
        <dl className="mt-5 grid gap-3 text-left sm:grid-cols-2">
          <div className="attendance-glass-inset p-4">
            <dt className="text-xs font-semibold text-slate-500">Attendance date</dt>
            <dd className="mt-1 font-semibold text-slate-950">{formatAttendanceDate(confirmation.attendance.attendanceDate, timeZone)}</dd>
          </div>
          <div className="attendance-glass-inset p-4">
            <dt className="text-xs font-semibold text-slate-500">Status</dt>
            <dd className="mt-1 font-semibold text-slate-950">{formatStatus(confirmation.attendance.status)}</dd>
          </div>
          <div className="attendance-glass-inset p-4 sm:col-span-2">
            <dt className="text-xs font-semibold text-slate-500">Institution and branch</dt>
            <dd className="mt-1 font-semibold text-slate-950">{card.institutionName} · {card.branchName}</dd>
          </div>
        </dl>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="premium-primary-button min-h-12 w-full gap-2 premium-focus"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Show Attendance QR
          </button>
          <Link href="/staffboard/attendance/me" className="premium-secondary-button min-h-12 w-full gap-2 premium-focus">
            <History className="h-4 w-4" aria-hidden="true" />
            Attendance history
          </Link>
        </div>
      </section>
    );
  }

  const pageState = qrStateCopy(credentialState, attendance);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4" data-staff-attendance-qr-presentation="true">
      <section className="attendance-glass-panel overflow-hidden p-4 sm:p-6">
        <div className="text-center">
          <span
            className={"inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold " + statusClasses(pageState.tone)}
            role="status"
            aria-live="polite"
            data-attendance-qr-state={pageState.code}
          >
            {pageState.tone === "success" ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
            {pageState.tone === "ready" ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : null}
            {pageState.tone === "warning" || pageState.tone === "error" ? <TriangleAlert className="h-4 w-4" aria-hidden="true" /> : null}
            {pageState.label}
          </span>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{pageState.description}</p>
        </div>

        {pageState.showQr ? (
          <div className="mx-auto mt-5 flex aspect-square w-full max-w-[22rem] items-center justify-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <QRCodeSVG
              value={card.qrPayload}
              size={336}
              level="H"
              marginSize={3}
              title={"Staff Attendance QR for " + card.staffName}
              className="h-auto w-full"
            />
          </div>
        ) : (
          <div className="mx-auto mt-5 flex aspect-square w-full max-w-[22rem] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div>
              <Clock3 className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
              <p className="mt-3 font-semibold text-slate-800">{pageState.label}</p>
              {attendance?.checkInAt ? (
                <p className="mt-2 text-sm text-slate-600">
                  Check-in {formatAttendanceTime(attendance.checkInAt, timeZone)}
                  {attendance.checkOutAt ? " · Check-out " + formatAttendanceTime(attendance.checkOutAt, timeZone) : ""}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="mt-5 text-center">
          <h2 className="text-xl font-semibold text-slate-950">{card.staffName}</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">Employee {card.employeeCode}</p>
          <p className="mt-1 text-sm text-slate-500">{card.institutionName} · {card.branchName}</p>
        </div>
      </section>

      <section className="attendance-glass-panel p-4" aria-labelledby="attendance-qr-help-title">
        <h2 id="attendance-qr-help-title" className="font-semibold text-slate-950">How to use</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep this screen visible and show the QR to an authorised JinaCampus attendance scanner. Do not share it with another person.
        </p>
        {monitorMessage ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500" aria-live="polite">
            <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
            {monitorMessage}
          </p>
        ) : null}
      </section>

      <Link href="/staffboard/attendance/me" className="premium-secondary-button min-h-12 w-full gap-2 premium-focus">
        <History className="h-4 w-4" aria-hidden="true" />
        View Attendance History
      </Link>
    </div>
  );
}
