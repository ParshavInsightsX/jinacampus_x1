"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Eye,
  IdCard,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  XCircle
} from "lucide-react";
import {
  issueStaffAttendanceCredentialAction,
  previewStaffAttendanceCredentialAction,
  recordStaffAttendanceCredentialPrintAction,
  revokeStaffAttendanceCredentialAction
} from "@/modules/staffboard-lite/actions/staff-attendance-domain.actions";
import { StaffIdentityCard } from "@/modules/staffboard-lite/components/attendance/staff-identity-card";
import type { StaffAttendanceIdentityCard } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";

type CredentialRosterRow = {
  id: string;
  branchId: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
  department: string | null;
  staffType: string;
  profilePhoto: { id: string } | null;
  branch: {
    name: string;
    code: string;
    institution: {
      name: string;
      displayName: string | null;
      logoUrl: string | null;
    };
  };
  attendanceCredentials: Array<{
    id: string;
    credentialVersion: number;
    issuedAt: Date | string;
    expiresAt: Date | string | null;
    lastUsedAt: Date | string | null;
    revokedAt: Date | string | null;
    revocationReason: string | null;
    status: string;
  }>;
};

type StaffAttendanceCredentialManagerProps = {
  rows: CredentialRosterRow[];
};

function staffName(row: CredentialRosterRow) {
  return [row.firstName, row.middleName, row.lastName].filter(Boolean).join(" ");
}

function formatDate(value: Date | string | null) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function activeCredential(row: CredentialRosterRow | null) {
  if (!row) return null;
  return row.attendanceCredentials.find((credential) => credential.status === "ACTIVE") ?? null;
}

export function StaffAttendanceCredentialManager({
  rows
}: StaffAttendanceCredentialManagerProps) {
  const [selectedStaffId, setSelectedStaffId] = useState(rows[0]?.id ?? "");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const [card, setCard] = useState<StaffAttendanceIdentityCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedStaffId) ?? null,
    [rows, selectedStaffId]
  );
  const selectedActiveCredential = activeCredential(selected);

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  function issueCard() {
    if (!selectedStaffId || isPending) return;
    if (selectedActiveCredential && !replacementReason) {
      setError("Select why this active card is being reissued.");
      return;
    }
    if (
      selectedActiveCredential &&
      !window.confirm("Issue a replacement card? The current card will stop working immediately.")
    ) {
      return;
    }

    resetFeedback();
    setCard(null);
    startTransition(async () => {
      const response = await issueStaffAttendanceCredentialAction({
        staffId: selectedStaffId,
        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(selectedActiveCredential && replacementReason ? { replacementReason } : {})
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCard(response.data);
      setMessage(response.message);
      setReason("");
      setReplacementReason("");
    });
  }

  function previewCard(credentialId: string) {
    resetFeedback();
    setCard(null);
    startTransition(async () => {
      const response = await previewStaffAttendanceCredentialAction({ credentialId });
      if (!response.ok) {
        setError(
          response.code === "STAFF_ATTENDANCE_CREDENTIAL_REISSUE_REQUIRED"
            ? "This older card remains valid for scanning but cannot be reopened. Reissue it to enable secure digital viewing."
            : response.error
        );
        return;
      }
      setCard(response.data);
      setMessage(response.message);
    });
  }

  function printCard() {
    if (!card || isPending) return;
    resetFeedback();
    startTransition(async () => {
      const response = await recordStaffAttendanceCredentialPrintAction({
        credentialId: card.credentialId
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      window.print();
    });
  }

  function revokeCard(credentialId: string, name: string) {
    const revocationReason = window.prompt("Why are you revoking " + name + "'s attendance card?");
    if (!revocationReason || revocationReason.trim().length < 5) return;
    resetFeedback();
    startTransition(async () => {
      const response = await revokeStaffAttendanceCredentialAction({
        credentialId,
        reason: revocationReason.trim()
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      setCard(null);
      window.location.reload();
    });
  }

  if (rows.length === 0) {
    return (
      <section className="attendance-glass-panel p-6 text-center">
        <IdCard className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 font-semibold text-slate-950">No active staff available</h2>
        <p className="mt-2 text-sm text-slate-600">
          Add an active staff profile and branch assignment before creating an attendance card.
        </p>
      </section>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="attendance-glass-panel no-print p-4 sm:p-5" aria-labelledby="issue-card-title">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
            <IdCard className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="issue-card-title" className="font-semibold text-slate-950">
              Issue Staff Attendance Card
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Only an authorised Principal can issue, replace, preview, print, or revoke cards.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Staff member
            <select
              value={selectedStaffId}
              onChange={(event) => {
                setSelectedStaffId(event.target.value);
                setCard(null);
                setReplacementReason("");
              }}
              disabled={isPending}
              className="min-h-12"
            >
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {staffName(row)} - {row.employeeCode} - {row.branch.code}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Card validity end (optional)
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              disabled={isPending}
              className="min-h-12"
            />
          </label>

          {selectedActiveCredential ? (
            <label className="grid gap-2 text-sm font-medium text-slate-800">
              Replacement reason
              <select
                value={replacementReason}
                onChange={(event) => setReplacementReason(event.target.value)}
                disabled={isPending}
                className="min-h-12"
                required
              >
                <option value="">Select a reason</option>
                <option value="LOST">Lost card</option>
                <option value="DAMAGED">Damaged card</option>
                <option value="DETAILS_CHANGED">Staff details changed</option>
                <option value="POLICY_REISSUE">Policy reissue</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          ) : null}

          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Note (optional)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={isPending}
              rows={3}
              maxLength={250}
              placeholder="Add a short administrative note"
            />
          </label>
        </div>

        {selectedActiveCredential ? (
          <div className="attendance-glass-inset mt-4 p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Active card - Version {selectedActiveCredential.credentialVersion}
            </p>
            <p className="mt-1">Issued {formatDate(selectedActiveCredential.issuedAt)}</p>
            <p>Expires {formatDate(selectedActiveCredential.expiresAt)}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={issueCard}
          disabled={isPending || !selectedStaffId}
          className="premium-primary-button mt-5 min-h-12 w-full gap-2 premium-focus"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : selectedActiveCredential ? (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          ) : (
            <IdCard className="h-4 w-4" aria-hidden="true" />
          )}
          {isPending
            ? "Working..."
            : selectedActiveCredential
              ? "Issue Replacement Card"
              : "Issue Attendance Card"}
        </button>

        {message ? (
          <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </p>
        ) : null}
      </section>

      <div className="space-y-5">
        {card ? (
          <section className="attendance-glass-panel p-4 sm:p-6" aria-labelledby="card-preview-title">
            <div className="no-print flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" aria-hidden="true" />
              <div>
                <h2 id="card-preview-title" className="font-semibold text-slate-950">
                  Staff Card Preview
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Printing is recorded in the audit log. Only the front and reverse card surfaces are printed.
                </p>
              </div>
            </div>
            <div className="identity-card-print-area mt-5">
              <StaffIdentityCard card={card} mode="manager" />
            </div>
            <button
              type="button"
              onClick={printCard}
              disabled={isPending}
              className="premium-primary-button no-print mt-5 min-h-12 w-full gap-2 premium-focus sm:w-auto"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="h-4 w-4" aria-hidden="true" />
              )}
              Print Front and Back
            </button>
          </section>
        ) : null}

        <section className="attendance-glass-panel no-print overflow-hidden" aria-labelledby="card-history-title">
          <div className="border-b border-white/80 p-4 sm:p-5">
            <h2 id="card-history-title" className="font-semibold text-slate-950">
              Card Issuance History
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review active, replaced, and revoked attendance cards for each staff member.
            </p>
          </div>
          <div className="divide-y divide-slate-200/80">
            {rows.map((row) => {
              const active = activeCredential(row);
              return (
                <article key={row.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{staffName(row)}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {row.employeeCode} - {row.designation ?? "Staff Member"} - {row.branch.name}
                      </p>
                    </div>
                    {active ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => previewCard(active.id)}
                          disabled={isPending}
                          className="premium-secondary-button min-h-11 gap-2 premium-focus"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => revokeCard(active.id, staffName(row))}
                          disabled={isPending}
                          className="premium-danger-button min-h-11 gap-2 premium-focus"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Revoke
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {row.attendanceCredentials.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[580px] text-left text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="py-2 pr-3">Version</th>
                            <th className="py-2 pr-3">Status</th>
                            <th className="py-2 pr-3">Issued</th>
                            <th className="py-2 pr-3">Expires</th>
                            <th className="py-2">Last used</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.attendanceCredentials.map((credential) => (
                            <tr key={credential.id} className="border-t border-slate-200/70 text-slate-700">
                              <td className="py-2 pr-3">{credential.credentialVersion}</td>
                              <td className="py-2 pr-3 font-semibold">{credential.status.replaceAll("_", " ")}</td>
                              <td className="py-2 pr-3">{formatDate(credential.issuedAt)}</td>
                              <td className="py-2 pr-3">{formatDate(credential.expiresAt)}</td>
                              <td className="py-2">{credential.lastUsedAt ? formatDate(credential.lastUsedAt) : "Not used"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No card has been issued.</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
