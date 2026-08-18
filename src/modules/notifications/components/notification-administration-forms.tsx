"use client";

import { CircleAlert, LoaderCircle, Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

type Scope = { type: "TENANT" } | { type: "INSTITUTION"; institutionId: string };
type Setting = {
  retentionDays: number;
  defaultPriority: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timeZone: string;
  mandatoryCategories: string[];
  featureEnabled: boolean;
};

type Props = {
  scope: Scope;
  initialSetting: Setting | null;
  canManageSettings: boolean;
  canManageTemplates: boolean;
};

const CATEGORIES = ["ACCOUNT", "ACADEMIC", "ATTENDANCE", "GRADEBOOK", "LEAVE", "CALENDAR", "SECURITY", "SYSTEM"];
const MODULES = ["CAMPUS_CORE", "ACADEMIA", "ATTENDANCE", "GRADEBOOK", "STAFFBOARD", "CALENDAR", "SYSTEM"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

async function safeJson(response: Response) {
  return response.json() as Promise<{ success?: boolean; error?: string }>;
}

export function NotificationAdministrationForms({
  scope,
  initialSetting,
  canManageSettings,
  canManageTemplates
}: Props) {
  const router = useRouter();
  const templateForm = useRef<HTMLFormElement>(null);
  const [setting, setSetting] = useState(initialSetting);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveSettings() {
    if (!setting) return;
    setSettingsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, ...setting })
      });
      const data = await safeJson(response);
      if (!response.ok || !data.success) throw new Error(data.error || "Notification settings could not be saved.");
      setMessage("Notification settings saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notification settings could not be saved.");
    } finally {
      setSettingsBusy(false);
    }
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTemplateBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/notifications/templates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          templateKey: String(form.get("templateKey") ?? ""),
          name: String(form.get("name") ?? ""),
          sourceModule: String(form.get("sourceModule") ?? "SYSTEM"),
          category: String(form.get("category") ?? "SYSTEM"),
          defaultPriority: String(form.get("defaultPriority") ?? "NORMAL"),
          titleTemplate: String(form.get("titleTemplate") ?? ""),
          bodyTemplate: String(form.get("bodyTemplate") ?? ""),
          deepLinkTemplate: String(form.get("deepLinkTemplate") ?? "").trim() || null,
          requiredVariables: String(form.get("requiredVariables") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          mandatory: form.get("mandatory") === "on",
          requiresAcknowledgement: form.get("requiresAcknowledgement") === "on",
          status: "ACTIVE"
        })
      });
      const data = await safeJson(response);
      if (!response.ok || !data.success) throw new Error(data.error || "Notification template could not be created.");
      templateForm.current?.reset();
      setMessage("Notification template created.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notification template could not be created.");
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p> : null}

      {setting ? (
        <section className="space-y-4 border-y border-campus-border py-5" aria-labelledby="notification-settings-heading">
          <div>
            <h2 id="notification-settings-heading" className="text-lg font-bold text-brand-950">Institution policy</h2>
            <p className="mt-1 text-sm text-slate-600">Controls optional generation policy for this operational scope.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Retention days<input type="number" min={30} max={3650} disabled={!canManageSettings} value={setting.retentionDays} onChange={(event) => setSetting({ ...setting, retentionDays: Number(event.target.value) })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700">Default priority<select disabled={!canManageSettings} value={setting.defaultPriority} onChange={(event) => setSetting({ ...setting, defaultPriority: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 premium-focus">{PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Time zone<input disabled={!canManageSettings} value={setting.timeZone} onChange={(event) => setSetting({ ...setting, timeZone: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="inline-flex min-h-11 items-center gap-3 self-end text-sm font-semibold text-slate-700"><input type="checkbox" disabled={!canManageSettings} checked={setting.featureEnabled} onChange={(event) => setSetting({ ...setting, featureEnabled: event.target.checked })} className="h-5 w-5 rounded border-slate-300 text-brand-700 premium-focus" />Generation enabled</label>
            <label className="text-sm font-semibold text-slate-700">Quiet from<input type="time" disabled={!canManageSettings} value={setting.quietHoursStart ?? ""} onChange={(event) => setSetting({ ...setting, quietHoursStart: event.target.value || null })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700">Quiet until<input type="time" disabled={!canManageSettings} value={setting.quietHoursEnd ?? ""} onChange={(event) => setSetting({ ...setting, quietHoursEnd: event.target.value || null })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
          </div>
          <fieldset disabled={!canManageSettings}>
            <legend className="text-sm font-bold text-slate-800">Mandatory categories</legend>
            <div className="mt-2 flex flex-wrap gap-2">{CATEGORIES.map((category) => <label key={category} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-campus-border bg-white px-3 text-sm text-slate-700"><input type="checkbox" checked={setting.mandatoryCategories.includes(category)} onChange={(event) => setSetting({ ...setting, mandatoryCategories: event.target.checked ? [...setting.mandatoryCategories, category] : setting.mandatoryCategories.filter((value) => value !== category) })} className="h-4 w-4 rounded border-slate-300 text-brand-700 premium-focus" />{label(category)}</label>)}</div>
          </fieldset>
          {canManageSettings ? <button type="button" disabled={settingsBusy} onClick={() => void saveSettings()} className="premium-primary-button inline-flex min-h-11 items-center gap-2">{settingsBusy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{settingsBusy ? "Saving..." : "Save policy"}</button> : null}
        </section>
      ) : null}

      {canManageTemplates ? (
        <section className="space-y-4 border-b border-campus-border pb-6" aria-labelledby="new-template-heading">
          <div><h2 id="new-template-heading" className="text-lg font-bold text-brand-950">New template</h2><p className="mt-1 text-sm text-slate-600">Use double-brace variables declared in the required-variable list.</p></div>
          <form ref={templateForm} onSubmit={createTemplate} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">Template key<input required name="templateKey" placeholder="attendance.student.absent" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700">Name<input required name="name" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700">Source module<select name="sourceModule" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 premium-focus">{MODULES.map((module) => <option key={module} value={module}>{label(module)}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Category<select name="category" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 premium-focus">{CATEGORIES.map((category) => <option key={category} value={category}>{label(category)}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Priority<select name="defaultPriority" defaultValue="NORMAL" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 premium-focus">{PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Required variables<input name="requiredVariables" placeholder="studentName, attendanceDate" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Title template<input required name="titleTemplate" maxLength={160} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Body template<textarea required name="bodyTemplate" maxLength={500} rows={4} className="mt-1 w-full rounded-lg border border-campus-border p-3 premium-focus" /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Internal link template<input name="deepLinkTemplate" placeholder="/academia/students/{{studentId}}" className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 premium-focus" /></label>
            <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-700"><input name="mandatory" type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700 premium-focus" />Mandatory</label>
            <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-700"><input name="requiresAcknowledgement" type="checkbox" className="h-5 w-5 rounded border-slate-300 text-brand-700 premium-focus" />Requires acknowledgement</label>
            <button type="submit" disabled={templateBusy} className="premium-primary-button inline-flex min-h-11 items-center justify-center gap-2 md:col-span-2 md:justify-self-start">{templateBusy ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{templateBusy ? "Creating..." : "Create template"}</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}