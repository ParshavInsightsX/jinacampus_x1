"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import type { StaffQrActionData } from "@/modules/staffboard-lite/actions/staff-qr.actions";
import {
  deactivateStaffAttendanceQrAction,
  generateStaffAttendanceQrAction
} from "@/modules/staffboard-lite/actions/staff-qr.actions";
import type { StaffQrBranchOption } from "@/modules/staffboard-lite/queries";
import { StaffQrCountdown } from "./staff-qr-countdown";
import {
  formatPurpose,
  formatQrDateTime,
  formatQrStatus,
  formatValidityDuration,
  getQrDisplayStatus,
  getSecondsRemaining,
  type StaffQrPurposeOption
} from "./staff-qr-display-state";
import { StaffQrPurposeSelect } from "./staff-qr-purpose-select";

type StaffQrDisplayProps = {
  branchOptions: StaffQrBranchOption[];
  defaultBranchId: string;
};

function actionMessage(code: string, fallback: string) {
  if (code === "STAFF_QR_ATTENDANCE_DISABLED") {
    return "Staff QR attendance is disabled for this branch.";
  }
  if (code === "STAFF_QR_BRANCH_REQUIRED") {
    return "Select a branch before generating a QR code.";
  }
  if (code === "STAFF_QR_OPERATOR_ACCESS_REQUIRED") {
    return "Only an authorised Principal or Office Staff QR Operator can manage attendance QR codes.";
  }
  if (code === "FORBIDDEN" || code.startsWith("FORBIDDEN_PERMISSION") || code.startsWith("FORBIDDEN_")) {
    return "You do not have permission to generate staff attendance QR codes for this branch.";
  }
  return fallback;
}

function staffQrLabel(branch: StaffQrBranchOption) {
  return `${branch.name} (${branch.code})`;
}

function TodaySummaryCards({
  qr,
  status
}: {
  qr: StaffQrActionData | null;
  status: "ACTIVE" | "DEACTIVATED" | "EXPIRED" | null;
}) {
  const cards = [
    { label: "Current status", value: status ? formatQrStatus(status) : "Not generated" },
    { label: "Purpose", value: qr ? formatPurpose(qr.purpose) : "-" },
    { label: "Validity", value: qr ? formatValidityDuration(qr.expiresInSeconds) : "5 hours" },
    { label: "Lifecycle", value: "Audited" }
  ];

  return (
    <section aria-labelledby="staff-qr-today-summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <h2 id="staff-qr-today-summary" className="sr-only">
        Today summary
      </h2>
      {cards.map((card) => (
        <div key={card.label} className="premium-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{card.value}</p>
        </div>
      ))}
    </section>
  );
}

export function StaffQrDisplay({ branchOptions, defaultBranchId }: StaffQrDisplayProps) {
  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranchId);
  const [selectedPurpose, setSelectedPurpose] = useState<StaffQrPurposeOption>("CHECK_IN");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [qr, setQr] = useState<StaffQrActionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const autoRefreshTokenRef = useRef<string | null>(null);

  const selectedBranch = useMemo(
    () => branchOptions.find((branch) => branch.id === selectedBranchId) ?? branchOptions[0] ?? null,
    [branchOptions, selectedBranchId]
  );
  const secondsRemaining = qr ? getSecondsRemaining(qr.validUntil, new Date(nowMs)) : 0;
  const qrStatus = qr ? getQrDisplayStatus(qr.status, qr.validUntil, new Date(nowMs)) : null;
  const expired = qrStatus === "EXPIRED";
  const active = qrStatus === "ACTIVE";
  const statusClassName = active
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : qrStatus === "DEACTIVATED"
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : "border-rose-200 bg-rose-50 text-rose-800";
  const branchSelectorVisible = branchOptions.length > 1;

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  async function generateQr() {
    if (!selectedBranch) {
      setError("No branch is available for QR generation.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    const result = await generateStaffAttendanceQrAction({
      branchId: selectedBranch.id,
      purpose: selectedPurpose
    });

    if (result.ok) {
      setQr(result.data);
      autoRefreshTokenRef.current = null;
    } else {
      setError(actionMessage(result.code, result.error));
    }

    setIsGenerating(false);
  }

  async function deactivateQr() {
    if (!qr || !active) return;

    setIsDeactivating(true);
    setError(null);
    const result = await deactivateStaffAttendanceQrAction({ qrTokenId: qr.qrTokenId });

    if (result.ok) {
      setQr((current) => current ? { ...current, status: result.data.status } : current);
      setAutoRefresh(false);
    } else {
      setError(actionMessage(result.code, result.error));
    }

    setIsDeactivating(false);
  }

  useEffect(() => {
    if (!autoRefresh || !qr || qrStatus !== "EXPIRED" || isGenerating) return;
    if (autoRefreshTokenRef.current === qr.qrTokenId) return;

    autoRefreshTokenRef.current = qr.qrTokenId;
    void generateQr();
  }, [autoRefresh, isGenerating, qr, qrStatus]);

  return (
    <div className="space-y-5">
      <section className="premium-card p-4 sm:p-5" aria-label="Generate staff attendance QR">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div>
            <label htmlFor="staff-qr-branch" className="text-sm font-semibold text-slate-700">
              Branch
            </label>
            {branchSelectorVisible ? (
              <select
                id="staff-qr-branch"
                value={selectedBranchId}
                onChange={(event) => {
                  setSelectedBranchId(event.target.value);
                  setQr(null);
                  setError(null);
                }}
                disabled={isGenerating || isDeactivating}
                className="mt-2 min-h-11 w-full"
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {staffQrLabel(branch)}
                  </option>
                ))}
              </select>
            ) : (
              <div id="staff-qr-branch" className="mt-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                {selectedBranch ? staffQrLabel(selectedBranch) : "No branch available"}
              </div>
            )}
          </div>

          <StaffQrPurposeSelect
            value={selectedPurpose}
            disabled={isGenerating || isDeactivating}
            onChange={(purpose) => {
              setSelectedPurpose(purpose);
              setQr(null);
              setError(null);
            }}
          />

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <button
              type="button"
              onClick={() => void generateQr()}
              disabled={isGenerating || isDeactivating || !selectedBranch}
              className="premium-primary-button min-h-11 w-full lg:w-auto premium-focus"
            >
              {isGenerating ? "Generating..." : qr ? (active ? "Regenerate QR" : "Generate New QR") : "Generate QR"}
            </button>
            {qr && active ? (
              <button
                type="button"
                onClick={() => void deactivateQr()}
                disabled={isGenerating || isDeactivating}
                className="premium-secondary-button min-h-11 w-full lg:w-auto premium-focus"
              >
                {isDeactivating ? "Deactivating..." : "Deactivate"}
              </button>
            ) : null}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoRefresh}
            disabled={isGenerating || isDeactivating || qrStatus === "DEACTIVATED"}
            onChange={(event) => setAutoRefresh(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Auto-refresh QR when the countdown reaches zero
        </label>
      </section>

      {error ? <ErrorState title="QR could not be generated" description={error} /> : null}

      <TodaySummaryCards qr={qr} status={qrStatus} />

      <section className="premium-glass-panel p-4 sm:p-5" aria-labelledby="staff-qr-display-title">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 id="staff-qr-display-title" className="text-lg font-semibold text-slate-950">
              Current QR
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Display this code on a tablet or office screen for staff attendance.
            </p>
          </div>
          {qr ? (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              {qrStatus ? (
                <span className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold ${statusClassName}`}>
                  {formatQrStatus(qrStatus)}
                </span>
              ) : null}
              {qrStatus !== "DEACTIVATED" ? <StaffQrCountdown secondsRemaining={secondsRemaining} /> : null}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(280px,380px)_1fr] xl:items-start">
          <div className="relative flex min-h-[300px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-inner sm:min-h-[320px] sm:p-6">
            {qr ? (
              <>
                <div className={active ? "opacity-100" : "opacity-20"}>
                  <QRCodeSVG
                    value={qr.qrPayload}
                    size={280}
                    marginSize={3}
                    level="M"
                    title={`${formatPurpose(qr.purpose)} staff attendance QR`}
                    className="h-auto w-full max-w-[280px]"
                  />
                </div>
                {!active ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/[0.85] p-6 text-center backdrop-blur-sm">
                    <div>
                      <p className={`text-lg font-semibold ${expired ? "text-rose-700" : "text-slate-800"}`}>
                        {expired ? "QR expired" : "QR deactivated"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        This code is inactive. Generate a new QR before staff scan.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No active QR generated"
                description="Choose a check-in or check-out purpose, then generate a time-bound branch QR code."
              />
            )}
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Purpose</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">{qr ? formatPurpose(qr.purpose) : formatPurpose(selectedPurpose)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">{selectedBranch ? staffQrLabel(selectedBranch) : "-"}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated at</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">{qr ? formatQrDateTime(qr.validFrom, selectedBranch?.timezone) : "-"}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-sm">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expires at</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">{qr ? formatQrDateTime(qr.validUntil, selectedBranch?.timezone) : "-"}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/[0.72] p-4 shadow-sm sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Validity window</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">
                {qr ? `${formatValidityDuration(qr.expiresInSeconds)} from generation` : "Fixed at 5 hours"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
