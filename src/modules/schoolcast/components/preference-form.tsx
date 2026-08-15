"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  recordOwnSchoolCastConsentAction,
  updateOwnSchoolCastPreferenceAction,
} from "@/modules/schoolcast/actions";

type Preference = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  generalNoticesEnabled: boolean;
  homeworkUpdatesEnabled: boolean;
  attendanceAlertsEnabled: boolean;
  leaveUpdatesEnabled: boolean;
  calendarRemindersEnabled: boolean;
  gradebookUpdatesEnabled: boolean;
  feeUpdatesEnabled: boolean;
  contact: {
    email: string | null;
    phone: string | null;
    emailAvailable: boolean;
    phoneAvailable: boolean;
  };
};

const fields = [
  ["generalNoticesEnabled", "General notices"],
  ["homeworkUpdatesEnabled", "Homework and classwork"],
  ["attendanceAlertsEnabled", "Attendance alerts"],
  ["leaveUpdatesEnabled", "Leave updates"],
  ["calendarRemindersEnabled", "Calendar reminders"],
  ["gradebookUpdatesEnabled", "GradeBook updates"],
  ["feeUpdatesEnabled", "Fee updates"],
] as const;

const consentPurposes = [
  "NOTICE",
  "HOMEWORK",
  "ATTENDANCE",
  "LEAVE",
  "CALENDAR",
  "GRADEBOOK",
  "FEEDESK",
] as const;

export function PreferenceForm({
  preference,
  externalChannelsAvailable,
}: {
  preference: Preference;
  externalChannelsAvailable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const purposePreferences = Object.fromEntries(
      fields.map(([key]) => [key, form.get(key) === "on"]),
    );

    startTransition(async () => {
      const result = await updateOwnSchoolCastPreferenceAction({
        inAppEnabled: form.get("inAppEnabled") === "on",
        emailEnabled: form.get("emailEnabled") === "on",
        whatsappEnabled: form.get("whatsappEnabled") === "on",
        ...purposePreferences,
      });
      setMessage(result.ok ? result.message : result.error);
    });
  }

  function recordConsent(
    channel: "EMAIL" | "WHATSAPP",
    purpose: string,
    decision: "GRANTED" | "WITHDRAWN",
  ) {
    startTransition(async () => {
      const result = await recordOwnSchoolCastConsentAction({
        channel,
        purpose,
        decision,
        noticeVersion: "schoolcast-mvp-v1",
      });
      setMessage(result.ok ? result.message : result.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {message ? (
        <div
          role="status"
          className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
        >
          {message}
        </div>
      ) : null}

      <section className="premium-card p-5">
        <h2 className="text-base font-semibold text-ink">Channels</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ChannelToggle
            name="inAppEnabled"
            label="In application"
            checked={preference.inAppEnabled}
            disabled={pending}
          />
          {externalChannelsAvailable ? <ChannelToggle
            name="emailEnabled"
            label={"Email" + (preference.contact.email ? " (" + preference.contact.email + ")" : "")}
            checked={preference.emailEnabled}
            disabled={pending || !preference.contact.emailAvailable}
          /> : null}
          {externalChannelsAvailable ? <ChannelToggle
            name="whatsappEnabled"
            label={"WhatsApp" + (preference.contact.phone ? " (" + preference.contact.phone + ")" : "")}
            checked={preference.whatsappEnabled}
            disabled={pending || !preference.contact.phoneAvailable}
          /> : null}
        </div>
      </section>

      <section className="premium-card p-5">
        <h2 className="text-base font-semibold text-ink">Message purposes</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {fields.filter(([key]) => externalChannelsAvailable || key === "generalNoticesEnabled").map(([key, label]) => (
            <ChannelToggle
              key={key}
              name={key}
              label={label}
              checked={preference[key]}
              disabled={pending}
            />
          ))}
        </div>
      </section>

      {externalChannelsAvailable ? <section className="premium-card p-5">
        <h2 className="text-base font-semibold text-ink">
          External-channel consent
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Consent is recorded as immutable evidence. Withdrawing consent
          overrides an older grant.
        </p>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {consentPurposes.map((purpose) =>
            (["EMAIL", "WHATSAPP"] as const).map((channel) => (
              <div
                key={purpose + "-" + channel}
                className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 p-1"
              >
                <span className="min-w-36 flex-1 px-2 text-xs font-semibold text-slate-600">
                  {purpose} / {channel}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => recordConsent(channel, purpose, "GRANTED")}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Allow
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => recordConsent(channel, purpose, "WITHDRAWN")}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Withdraw
                </button>
              </div>
            )),
          )}
        </div>
      </section> : null}

      <button
        type="submit"
        disabled={pending}
        className="premium-primary-button min-h-11 w-full sm:w-auto"
      >
        {pending ? "Saving..." : "Save preferences"}
      </button>
    </form>
  );
}

function ChannelToggle({
  name,
  label,
  checked,
  disabled,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3">
      <input
        name={name}
        type="checkbox"
        defaultChecked={checked}
        disabled={disabled}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}