"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  updateAttendanceSettingsAction,
  type CampusCoreFormActionState
} from "@/modules/campus-core/actions";

const initialState: CampusCoreFormActionState = { ok: false };

export function AttendanceSettingsForm({
  children,
  writable
}: {
  children: ReactNode;
  writable: boolean;
}) {
  const [state, formAction] = useActionState(updateAttendanceSettingsAction, initialState);

  return (
    <form action={formAction} className="premium-card grid gap-3 p-5 md:grid-cols-6">
      <fieldset disabled={!writable} className="contents">
        {children}
        {state.message || state.error ? (
          <div className="md:col-span-6">
            <FormMessage state={state} />
          </div>
        ) : null}
        <SubmitButton
          disabled={!writable}
          pendingLabel="Saving attendance settings..."
          className="min-h-11 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300 md:col-span-2"
        >
          {writable ? "Save attendance settings" : "View only"}
        </SubmitButton>
      </fieldset>
    </form>
  );
}
