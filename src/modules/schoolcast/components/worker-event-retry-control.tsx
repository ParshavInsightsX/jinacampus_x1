"use client";

import { useActionState } from "react";

import {
  requeueSchoolCastWorkerEventAction,
  type SchoolCastDeliveryActionState
} from "@/modules/schoolcast/actions";

const initialState: SchoolCastDeliveryActionState = { ok: false };

export function WorkerEventRetryControl({
  eventId,
  kind
}: {
  eventId: string;
  kind: "DOMAIN_EVENT" | "GRADEBOOK_EVENT";
}) {
  const [state, action, pending] = useActionState(requeueSchoolCastWorkerEventAction, initialState);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="sr-only" htmlFor={`event-retry-${eventId}`}>Integration retry reason</label>
      <input
        id={`event-retry-${eventId}`}
        name="reason"
        required
        minLength={10}
        maxLength={500}
        disabled={pending}
        placeholder="Reason after resolving integration failure"
        className="min-h-11 w-full"
      />
      <button type="submit" disabled={pending} className="premium-secondary-button min-h-11 w-full">
        {pending ? "Requeuing..." : "Retry integration event"}
      </button>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
