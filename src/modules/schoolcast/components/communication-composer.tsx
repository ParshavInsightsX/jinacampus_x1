"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

import { createSchoolCastCommunicationAction } from "@/modules/schoolcast/actions";

type Props = {
  branchId: string;
  academicYearId: string;
  classSections: readonly { id: string; displayName: string }[];
  roles: readonly { code: string; name: string }[];
  enabledChannels: { inApp: boolean; email: boolean; whatsApp: boolean };
  allowClassSectionAudience: boolean;
  defaultType?: "NOTICE" | "CIRCULAR" | "BROADCAST" | "EMERGENCY";
};

export function CommunicationComposer(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [audienceType, setAudienceType] = useState<"ALL_USERS" | "ROLE" | "CLASS_SECTION">(props.allowClassSectionAudience ? "CLASS_SECTION" : "ROLE");
  const [target, setTarget] = useState(props.allowClassSectionAudience ? props.classSections[0]?.id ?? "" : props.roles[0]?.code ?? "");
  const defaultChannels = useMemo(() => [props.enabledChannels.inApp ? "IN_APP" : null].filter(Boolean) as string[], [props.enabledChannels.inApp]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    const channels = ["IN_APP", "EMAIL", "WHATSAPP"].filter((channel) => form.get(`channel-${channel}`) === "on");
    const audienceRule = audienceType === "ALL_USERS"
      ? { ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }
      : audienceType === "ROLE"
        ? { ruleType: "ROLE", mode: "INCLUDE", targetIds: [], roleCodes: [target] }
        : { ruleType: "CLASS_SECTION", mode: "INCLUDE", targetIds: [target], roleCodes: [] };
    startTransition(async () => {
      const result = await createSchoolCastCommunicationAction({
        branchId: props.branchId,
        academicYearId: props.academicYearId,
        type: form.get("type"),
        category: form.get("category"),
        priority: form.get("priority"),
        title: form.get("title"),
        summary: form.get("summary") || undefined,
        content: form.get("content"),
        languageCode: "en",
        acknowledgementRequired: form.get("acknowledgementRequired") === "on",
        audienceRules: [audienceRule],
        channels
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/schoolcast/communications/${String(result.data.id)}`);
      router.refresh();
    });
  }

  const targets = audienceType === "ROLE" ? props.roles.map((role) => ({ id: role.code, label: role.name })) : props.classSections.map((section) => ({ id: section.id, label: section.displayName }));

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {error ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
      <section className="premium-card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm font-semibold text-slate-700">Type
            <select name="type" defaultValue={props.defaultType ?? "NOTICE"} disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal">
              <option value="NOTICE">Notice</option><option value="CIRCULAR">Circular</option><option value="BROADCAST">Broadcast</option><option value="EMERGENCY">Emergency</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">Category
            <input name="category" required defaultValue="GENERAL" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
          </label>
          <label className="space-y-2 text-sm font-semibold text-slate-700">Priority
            <select name="priority" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal"><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="EMERGENCY">Emergency</option></select>
          </label>
        </div>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Title
          <input name="title" minLength={5} maxLength={180} required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Short summary
          <input name="summary" maxLength={500} disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
        </label>
        <label className="block space-y-2 text-sm font-semibold text-slate-700">Message
          <textarea name="content" required maxLength={20000} rows={8} disabled={pending} className="w-full rounded-lg border border-slate-200 p-3 font-normal leading-6" />
        </label>
      </section>

      <section className="premium-card space-y-4 p-5">
        <h2 className="text-base font-semibold text-ink">Audience and channels</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-slate-700">Audience
            <select value={audienceType} onChange={(event) => { const next = event.target.value as typeof audienceType; setAudienceType(next); setTarget(next === "ROLE" ? props.roles[0]?.code ?? "" : props.classSections[0]?.id ?? ""); }} disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal">
              {props.allowClassSectionAudience ? <option value="CLASS_SECTION">Class-section</option> : null}<option value="ROLE">Role</option><option value="ALL_USERS">All active users in branch</option>
            </select>
          </label>
          {audienceType !== "ALL_USERS" ? <label className="space-y-2 text-sm font-semibold text-slate-700">Target
            <select value={target} onChange={(event) => setTarget(event.target.value)} required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal">
              {targets.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label> : null}
        </div>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Delivery channels</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              { code: "IN_APP", label: "In application", enabled: props.enabledChannels.inApp },
              { code: "EMAIL", label: "Email", enabled: props.enabledChannels.email },
              { code: "WHATSAPP", label: "WhatsApp", enabled: props.enabledChannels.whatsApp }
            ].map((channel) => <label key={channel.code} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm"><input type="checkbox" name={`channel-${channel.code}`} defaultChecked={defaultChannels.includes(channel.code)} disabled={pending || !channel.enabled} />{channel.label}{!channel.enabled ? <span className="ml-auto text-xs text-slate-400">Off</span> : null}</label>)}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" name="acknowledgementRequired" disabled={pending} />Require acknowledgement</label>
      </section>
      <div className="sticky bottom-24 z-10 flex justify-end rounded-lg border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur lg:bottom-32">
        <button type="submit" disabled={pending} className="premium-primary-button min-h-11 w-full sm:w-auto">{pending ? "Saving draft..." : "Save communication draft"}</button>
      </div>
    </form>
  );
}