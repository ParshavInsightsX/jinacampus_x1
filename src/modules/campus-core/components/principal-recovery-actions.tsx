"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/ui/form-primitives";
import {
  approvePrincipalRecoveryAction,
  rejectPrincipalRecoveryAction,
  type PrincipalRecoveryActionState
} from "@/modules/campus-core/administrator-actions";

const initialState: PrincipalRecoveryActionState = { ok: false };

function OneTimeCredential({
  credential
}: {
  credential: NonNullable<PrincipalRecoveryActionState["oneTimeCredential"]>;
}) {
  const [copied, setCopied] = useState(false);
  const label = credential.type === "RESET_LINK" ? "One-time reset link" : "One-time temporary password";

  async function copyCredential() {
    await navigator.clipboard.writeText(credential.value);
    setCopied(true);
  }

  return (
    <div role="status" className="space-y-3 border-t border-emerald-200 pt-4">
      <div>
        <p className="text-sm font-semibold text-emerald-900">{label}</p>
        <p className="mt-1 text-xs leading-5 text-emerald-800">
          This value is not stored in plaintext and cannot be retrieved later. Deliver it only after identity verification
          {credential.deliveryTarget ? ` to ${credential.deliveryTarget}` : ""}.
        </p>
      </div>
      <output className="block max-h-36 overflow-auto break-all rounded-lg border border-emerald-200 bg-white px-3 py-3 font-mono text-sm text-slate-950">
        {credential.value}
      </output>
      {credential.expiresAt ? (
        <p className="text-xs text-emerald-800">
          Expires {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(credential.expiresAt))}
        </p>
      ) : (
        <p className="text-xs text-emerald-800">The Principal must change this temporary password after the next successful sign-in.</p>
      )}
      <button type="button" onClick={copyCredential} className="premium-secondary-button w-full premium-focus sm:w-auto">
        {copied ? "Copied" : "Copy securely"}
      </button>
    </div>
  );
}

function ApprovalForm({
  requestId,
  method,
  label
}: {
  requestId: string;
  method: "RESET_LINK" | "TEMPORARY_PASSWORD";
  label: string;
}) {
  const [state, formAction, pending] = useActionState(approvePrincipalRecoveryAction, initialState);

  return (
    <form action={formAction} className="space-y-3 border-t border-slate-200 pt-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="resetMethod" value={method} />
      <label className="block text-sm font-semibold text-slate-800">
        Identity-verification notes
        <textarea
          name="reviewRemarks"
          rows={3}
          required
          minLength={10}
          maxLength={500}
          disabled={pending}
          className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 premium-focus"
          placeholder="Record the private verification method; do not enter passwords or identity-document numbers."
        />
      </label>
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-5 text-slate-700">
        <input
          type="checkbox"
          name="identityVerified"
          required
          disabled={pending}
          className="mt-0.5 h-5 w-5 rounded border-slate-300"
        />
        I verified the Principal identity and confirmed the tenant and institution shown above.
      </label>
      <FormMessage state={state} />
      {state.oneTimeCredential ? <OneTimeCredential credential={state.oneTimeCredential} /> : (
        <button type="submit" disabled={pending} className="premium-primary-button w-full premium-focus">
          {pending ? "Authorising..." : label}
        </button>
      )}
    </form>
  );
}

export function PrincipalRecoveryActions({ requestId }: { requestId: string }) {
  const [rejectState, rejectAction, rejecting] = useActionState(rejectPrincipalRecoveryAction, initialState);

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <ApprovalForm requestId={requestId} method="RESET_LINK" label="Approve secure reset link" />
      <ApprovalForm requestId={requestId} method="TEMPORARY_PASSWORD" label="Assign temporary password" />
      <form action={rejectAction} className="space-y-3 border-t border-slate-200 pt-4">
        <input type="hidden" name="requestId" value={requestId} />
        <label className="block text-sm font-semibold text-slate-800">
          Rejection reason
          <textarea
            name="reviewRemarks"
            rows={3}
            required
            minLength={5}
            maxLength={500}
            disabled={rejecting}
            className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 premium-focus"
            placeholder="Record the safe reason for rejection."
          />
        </label>
        <FormMessage state={rejectState} />
        <button type="submit" disabled={rejecting} className="premium-danger-button w-full premium-focus">
          {rejecting ? "Rejecting..." : "Reject request"}
        </button>
      </form>
    </div>
  );
}
