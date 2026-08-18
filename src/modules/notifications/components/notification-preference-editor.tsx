"use client";

import { CircleAlert, LoaderCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";

type Preference = {
  category: string;
  enabled: boolean;
  minimumPriority: string | null;
  quietHoursEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  timeZone: string;
  digestMode: string;
};

const MANDATORY = new Set(["ACCOUNT", "SECURITY", "SYSTEM"]);
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];
function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function NotificationPreferenceEditor() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/notifications/preferences", { credentials: "same-origin", cache: "no-store" });
        const data = await response.json() as { success?: boolean; preferences?: Preference[]; error?: string };
        if (!response.ok || !data.success || !data.preferences) throw new Error(data.error || "Preferences could not be loaded.");
        if (active) setPreferences(data.preferences);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Preferences could not be loaded.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  function update(index: number, values: Partial<Preference>) {
    setSaved(false);
    setPreferences((current) => current.map((preference, position) => position === index ? { ...preference, ...values } : preference));
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences })
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Preferences could not be saved.");
      setSaved(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Preferences could not be saved."); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="space-y-3" aria-label="Loading notification preferences">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}</div>;

  return <div className="space-y-4">
    {error ? <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div> : null}
    {saved ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Notification preferences saved.</p> : null}
    {preferences.map((preference, index) => {
      const mandatory = MANDATORY.has(preference.category);
      return <section key={preference.category} className="rounded-lg border border-campus-border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="font-bold text-slate-950">{label(preference.category)}</h2><p className="mt-1 text-sm text-slate-500">{mandatory ? "Required account and safety notices cannot be disabled." : "Choose whether and when these notices appear."}</p></div>
          <label className="inline-flex min-h-11 items-center gap-3 text-sm font-bold text-slate-700"><input type="checkbox" checked={preference.enabled} disabled={mandatory} onChange={(event) => update(index, { enabled: event.target.checked })} className="h-5 w-5 rounded border-slate-300 text-brand-700 premium-focus" />Enabled</label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700">Minimum priority<select value={preference.minimumPriority ?? ""} onChange={(event) => update(index, { minimumPriority: event.target.value || null })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 text-sm premium-focus"><option value="">All priorities</option>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Time zone<input value={preference.timeZone} onChange={(event) => update(index, { timeZone: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 text-sm premium-focus" /></label>
          <label className="inline-flex min-h-11 items-center gap-3 self-end text-sm font-semibold text-slate-700"><input type="checkbox" checked={preference.quietHoursEnabled} onChange={(event) => update(index, { quietHoursEnabled: event.target.checked })} className="h-5 w-5 rounded border-slate-300 text-brand-700 premium-focus" />Quiet hours</label>
          <label className="text-sm font-semibold text-slate-700">Summary preference<select value={preference.digestMode} onChange={(event) => update(index, { digestMode: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 text-sm premium-focus"><option value="IMMEDIATE">Immediate</option><option value="DAILY">Daily digest</option><option value="WEEKLY">Weekly digest</option></select></label>
        </div>
        {preference.quietHoursEnabled ? <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Quiet from<input type="time" value={preference.quietStart ?? ""} onChange={(event) => update(index, { quietStart: event.target.value || null })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 text-sm premium-focus" /></label><label className="text-sm font-semibold text-slate-700">Quiet until<input type="time" value={preference.quietEnd ?? ""} onChange={(event) => update(index, { quietEnd: event.target.value || null })} className="mt-1 min-h-11 w-full rounded-lg border border-campus-border px-3 text-sm premium-focus" /></label></div> : null}
      </section>;
    })}
    <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-10 flex justify-end border-t border-campus-border bg-app-background/95 py-3 backdrop-blur lg:bottom-4"><button type="button" onClick={() => void save()} disabled={saving || !preferences.length} className="premium-primary-button inline-flex min-h-11 w-full items-center justify-center gap-2 sm:w-auto">{saving ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}{saving ? "Saving..." : "Save preferences"}</button></div>
  </div>;
}