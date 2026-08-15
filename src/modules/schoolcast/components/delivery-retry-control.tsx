"use client";

import { useActionState } from "react";

import {
  requeueSchoolCastOutboxAction,
  type SchoolCastDeliveryActionState
} from "@/modules/schoolcast/actions";

const initialState: SchoolCastDeliveryActionState = { ok: false };

export function DeliveryRetryControl({ outboxId }: { outboxId: string }) {
  const [state, action, pending] = useActionState(requeueSchoolCastOutboxAction, initialState);

  return (
    <form action={action} className="min-w-64 space-y-2">
      <input type="hidden" name="outboxId" value={outboxId} />
      <label className="sr-only" htmlFor={`retry-reason-${outboxId}`}>Controlled retry reason</label>
      <input
        id={`retry-reason-${outboxId}`}
        name="reason"
        required
        minLength={10}
        maxLength={500}
        disabled={pending}
        placeholder="Reason after reviewing failure"
        className="min-h-11 w-full"
      />
      <button type="submit" disabled={pending} className="premium-secondary-button min-h-11 w-full">
        {pending ? "Requeuing..." : "Retry delivery"}
      </button>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
