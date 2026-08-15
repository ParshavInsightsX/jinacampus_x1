"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveSchoolCastCommunicationAction,
  cancelSchoolCastCommunicationAction,
  decideSchoolCastApprovalAction,
  publishSchoolCastCommunicationAction,
  scheduleSchoolCastCommunicationAction,
  submitSchoolCastCommunicationAction
} from "@/modules/schoolcast/actions";

type Props = {
  communicationId: string;
  status: string;
  capabilities: { canSubmit: boolean; canApprove: boolean; canReject: boolean; canPublish: boolean; canSchedule: boolean; canCancel: boolean; canArchive: boolean };
};

export function CommunicationActions({ communicationId, status, capabilities }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? result.message ?? "Action completed." : result.error ?? "Action failed.");
      router.refresh();
    });
  }

  return (
    <section className="premium-card space-y-4 p-5" aria-busy={pending}>
      <div><h2 className="text-base font-semibold text-ink">Workflow actions</h2><p className="mt-1 text-sm text-slate-500">Actions remain permission- and lifecycle-controlled on the server.</p></div>
      {message ? <div role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{message}</div> : null}
      {(status === "PENDING_APPROVAL" || capabilities.canCancel) ? <label className="block space-y-2 text-sm font-semibold text-slate-700">Decision or cancellation reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} disabled={pending} className="w-full rounded-lg border border-slate-200 p-3 font-normal" />
      </label> : null}
      {status === "APPROVED" && capabilities.canSchedule ? <label className="block space-y-2 text-sm font-semibold text-slate-700">Schedule for
        <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal sm:max-w-sm" />
      </label> : null}
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && capabilities.canSubmit ? <button type="button" disabled={pending} onClick={() => run(() => submitSchoolCastCommunicationAction({ communicationId }))} className="premium-primary-button min-h-11">Submit</button> : null}
        {status === "PENDING_APPROVAL" && capabilities.canApprove ? <button type="button" disabled={pending} onClick={() => run(() => decideSchoolCastApprovalAction({ communicationId, decision: "APPROVED", reason: reason || undefined }))} className="premium-primary-button min-h-11">Approve</button> : null}
        {status === "PENDING_APPROVAL" && capabilities.canReject ? <button type="button" disabled={pending || reason.trim().length === 0} onClick={() => run(() => decideSchoolCastApprovalAction({ communicationId, decision: "REJECTED", reason }))} className="premium-secondary-button min-h-11 text-rose-700">Reject</button> : null}
        {status === "PENDING_APPROVAL" && capabilities.canReject ? <button type="button" disabled={pending || reason.trim().length === 0} onClick={() => run(() => decideSchoolCastApprovalAction({ communicationId, decision: "RETURNED", reason }))} className="premium-secondary-button min-h-11">Return</button> : null}
        {(status === "APPROVED" || status === "SCHEDULED") && capabilities.canPublish ? <button type="button" disabled={pending} onClick={() => run(() => publishSchoolCastCommunicationAction({ communicationId }))} className="premium-primary-button min-h-11">Publish now</button> : null}
        {status === "APPROVED" && capabilities.canSchedule ? <button type="button" disabled={pending || !scheduledAt} onClick={() => run(() => scheduleSchoolCastCommunicationAction({ communicationId, scheduledAt: new Date(scheduledAt).toISOString() }))} className="premium-secondary-button min-h-11">Schedule</button> : null}
        {["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(status) && capabilities.canCancel ? <button type="button" disabled={pending || reason.trim().length < 5} onClick={() => run(() => cancelSchoolCastCommunicationAction({ communicationId, reason }))} className="premium-secondary-button min-h-11 text-rose-700">Cancel</button> : null}
        {["PUBLISHED", "PARTIALLY_DELIVERED", "EXPIRED", "CANCELLED", "FAILED"].includes(status) && capabilities.canArchive ? <button type="button" disabled={pending} onClick={() => run(() => archiveSchoolCastCommunicationAction({ communicationId, reason: reason || undefined }))} className="premium-secondary-button min-h-11">Archive</button> : null}
      </div>
    </section>
  );
}