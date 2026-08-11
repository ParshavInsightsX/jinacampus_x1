"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ErrorState } from "@/components/ui/empty-state";
import { scanStaffAttendanceQrAction } from "@/modules/staffboard-lite/actions/staff-qr-scan.actions";
import { StaffQrManualTokenInput } from "./staff-qr-manual-token-input";
import { StaffQrCameraScanner } from "./staff-qr-camera-scanner";
import { staffQrScanErrorMessage, staffQrScanErrorTitle } from "./staff-qr-scan-state";

type StaffQrScanFormProps = {
  variant?: "default" | "mobile";
};

export function StaffQrScanForm({ variant = "default" }: StaffQrScanFormProps) {
  const router = useRouter();
  const submissionLockRef = useRef(false);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitRawQrPayload(qrPayload: string) {
    if (submissionLockRef.current || isPending) return;

    submissionLockRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const actionResult = await scanStaffAttendanceQrAction({ qrPayload });
        setTokenInput("");

        if (actionResult.ok) {
          const purpose = actionResult.data.purpose === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN";
          router.replace(`/staffboard/attendance/me?scan=success&purpose=${purpose}`);
          return;
        }

        setError({
          code: actionResult.code,
          message: staffQrScanErrorMessage(actionResult.code, actionResult.error)
        });
      } catch {
        setTokenInput("");
        setError({
          code: "NETWORK_ERROR",
          message: "Attendance could not be verified. Check your connection and try again."
        });
      } finally {
        submissionLockRef.current = false;
      }
    });
  }

  function submitScan() {
    const qrPayload = tokenInput.trim();
    if (!qrPayload) {
      setError({
        code: "VALIDATION_ERROR",
        message: "QR payload is empty. Scan the staff attendance QR or use manual token entry."
      });
      return;
    }

    submitRawQrPayload(qrPayload);
  }

  const isMobile = variant === "mobile";

  return (
    <div className={isMobile ? "space-y-4" : "space-y-5"} data-qr-processing-lock={isPending ? "locked" : "ready"}>
      <StaffQrCameraScanner
        disabled={isPending}
        processing={isPending}
        variant={variant}
        onQrPayloadDetected={submitRawQrPayload}
      />

      {error ? (
        <ErrorState title={staffQrScanErrorTitle(error.code)} description={error.message}>
          <Link href="/staffboard/attendance/me" className="premium-secondary-button min-h-11 w-full premium-focus sm:w-auto">
            View current attendance
          </Link>
        </ErrorState>
      ) : null}

      <section
        className={isMobile ? "rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm shadow-slate-950/6" : "premium-card p-4 sm:p-5"}
        aria-labelledby="staff-scan-form-title"
        id="manual-qr-entry"
      >
        <div>
          <h2 id="staff-scan-form-title" className={isMobile ? "text-base font-semibold text-slate-950" : "text-lg font-semibold text-slate-950"}>
            Manual token entry
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Use this fallback when camera permission is denied, the browser is unsupported, or you are testing from desktop.
          </p>
        </div>

        <div className={isMobile ? "mt-4" : "mt-5"}>
          <StaffQrManualTokenInput value={tokenInput} disabled={isPending} compact={isMobile} onChange={setTokenInput} />
        </div>

        <div className={`mt-5 grid gap-3 ${isMobile ? "" : "sm:flex sm:items-center"}`}>
          <button
            type="button"
            onClick={submitScan}
            disabled={isPending}
            className={`premium-primary-button w-full min-h-12 premium-focus ${isMobile ? "text-base" : "sm:w-auto"}`}
          >
            {isPending ? "Submitting scan..." : "Submit Scan"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTokenInput("");
              setError(null);
            }}
            disabled={isPending}
            className={`premium-secondary-button w-full min-h-12 premium-focus ${isMobile ? "text-base" : "sm:w-auto"}`}
          >
            Reset
          </button>
        </div>
      </section>
    </div>
  );
}
