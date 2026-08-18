"use client";

import { Archive, BellRing, CheckCheck, CircleAlert, Inbox, LoaderCircle, Search, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Item = {
  id: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  notification: {
    id: string;
    sourceModule: string;
    category: string;
    priority: string;
    title: string;
    bodyPreview: string;
    mandatory: boolean;
    requiresAcknowledgement: boolean;
    createdAt: string;
  };
};

type Cursor = { createdAt: string; id: string };
type StateFilter = "all" | "unread" | "read" | "acknowledgement" | "archived";
type Filters = { state: StateFilter; search: string; sourceModule: string; category: string; priority: string };
type ListResponse = { success?: boolean; items?: Item[]; nextCursor?: Cursor | null; error?: string };

const INITIAL: Filters = { state: "all", search: "", sourceModule: "", category: "", priority: "" };
const TABS: readonly [StateFilter, string][] = [["all", "All"], ["unread", "Unread"], ["read", "Read"], ["acknowledgement", "Needs action"], ["archived", "Archived"]];
const SOURCES = ["CAMPUS_CORE", "ACADEMIA", "ATTENDANCE", "GRADEBOOK", "STAFFBOARD", "CALENDAR", "SYSTEM"];
const CATEGORIES = ["ACCOUNT", "ACADEMIC", "ATTENDANCE", "GRADEBOOK", "LEAVE", "CALENDAR", "SECURITY", "SYSTEM"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"];

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
}
function priorityClass(priority: string) {
  if (priority === "CRITICAL") return "border-red-200 bg-red-50 text-red-800";
  if (priority === "HIGH") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-800";
}
function announceChange() {
  window.dispatchEvent(new CustomEvent("jc:notifications-changed"));
}

export function NotificationCentre({ canManage = false }: { canManage?: boolean }) {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [searchDraft, setSearchDraft] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (active: Filters, next?: Cursor, append = false) => {
    append ? setMoreLoading(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ state: active.state, limit: "20" });
      for (const [key, value] of Object.entries(active)) if (key !== "state" && value) params.set(key, value);
      if (next) { params.set("cursorCreatedAt", next.createdAt); params.set("cursorId", next.id); }
      const response = await fetch(`/api/notifications?${params}`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json() as ListResponse;
      if (!response.ok || !data.success || !data.items) throw new Error(data.error || "Notifications could not be loaded.");
      setItems((current) => append ? [...current, ...data.items!] : data.items!);
      setCursor(data.nextCursor ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notifications could not be loaded.");
    } finally {
      append ? setMoreLoading(false) : setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filters); }, [filters, load]);

  async function mutate(id: string, action: "read" | "unread" | "archive" | "dismiss" | "acknowledge") {
    setBusy(id); setError(null);
    try {
      const response = await fetch(`/api/notifications/${id}/${action}`, { method: action === "acknowledge" ? "POST" : "PATCH", credentials: "same-origin" });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Notification could not be updated.");
      const now = new Date().toISOString();
      setItems((current) => current.flatMap((item) => {
        if (item.notification.id !== id) return [item];
        const leavesCurrentView =
          (action === "archive" && filters.state !== "archived") ||
          action === "dismiss" ||
          (action === "read" && filters.state === "unread") ||
          (action === "unread" && filters.state === "read") ||
          (action === "acknowledge" && filters.state === "acknowledgement");
        if (leavesCurrentView) return [];
        return [{ ...item,
          readAt: action === "unread" ? null : action === "read" || action === "archive" || action === "acknowledge" ? now : item.readAt,
          archivedAt: action === "archive" ? now : item.archivedAt,
          acknowledgedAt: action === "acknowledge" ? now : item.acknowledgedAt
        }];
       }));
      announceChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Notification could not be updated.");
    } finally { setBusy(null); }
  }

  async function markAllRead() {
    setBusy("all");
    try {
      const response = await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "same-origin" });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Notifications could not be updated.");
      const now = new Date().toISOString();
      setItems((current) => filters.state === "unread"
        ? []
        : current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      announceChange();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Notifications could not be updated."); }
    finally { setBusy(null); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters((current) => ({ ...current, search: searchDraft.trim() }));
  }

  const groups = useMemo(() => {
    const result = new Map<string, Item[]>();
    for (const item of items) { const key = dayLabel(item.createdAt); result.set(key, [...(result.get(key) ?? []), item]); }
    return [...result.entries()];
  }, [items]);
  const filtered = Boolean(filters.search || filters.sourceModule || filters.category || filters.priority);

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-bold text-brand-700">Personal inbox</p><h1 className="mt-1 text-2xl font-bold text-brand-950 sm:text-3xl">Notification centre</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">School updates resolved from your signed-in role and workspace.</p></div>
      <div className="flex flex-wrap gap-2">
        {canManage ? <Link href="/notifications/manage" className="premium-secondary-button inline-flex min-h-11 items-center gap-2"><Settings2 className="h-4 w-4" aria-hidden="true" />Manage</Link> : null}
        <Link href="/notifications/preferences" className="premium-secondary-button inline-flex min-h-11 items-center gap-2"><Settings2 className="h-4 w-4" aria-hidden="true" />Preferences</Link>
        <button type="button" onClick={() => void markAllRead()} disabled={busy === "all"} className="premium-primary-button inline-flex min-h-11 items-center gap-2">{busy === "all" ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}Mark all read</button>
      </div>
    </header>

    <section className="space-y-3 border-y border-campus-border py-4" aria-label="Notification filters">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">{TABS.map(([value, text]) => <button key={value} type="button" role="tab" aria-selected={filters.state === value} onClick={() => setFilters((current) => ({ ...current, state: value }))} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold premium-focus ${filters.state === value ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{text}</button>)}</div>
      <form onSubmit={submitSearch} className="grid gap-2 md:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))_auto]">
        <label className="relative"><span className="sr-only">Search notifications</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} maxLength={100} placeholder="Search notifications" className="min-h-11 w-full rounded-lg border border-campus-border bg-white pl-10 pr-3 text-sm premium-focus" /></label>
        <FilterSelect label="All modules" value={filters.sourceModule} options={SOURCES} onChange={(value) => setFilters((current) => ({ ...current, sourceModule: value }))} />
        <FilterSelect label="All categories" value={filters.category} options={CATEGORIES} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} />
        <FilterSelect label="All priorities" value={filters.priority} options={PRIORITIES} onChange={(value) => setFilters((current) => ({ ...current, priority: value }))} />
        <button type="submit" className="premium-secondary-button min-h-11">Search</button>
      </form>
      {filtered ? <button type="button" onClick={() => { setSearchDraft(""); setFilters((current) => ({ ...INITIAL, state: current.state })); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-bold text-slate-600 hover:bg-slate-100 premium-focus"><X className="h-4 w-4" aria-hidden="true" />Clear filters</button> : null}
    </section>

    {error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex gap-2"><CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</span><button type="button" onClick={() => void load(filters)} className="min-h-11 font-bold underline premium-focus">Retry</button></div> : null}
    {loading ? <div className="space-y-3" aria-label="Loading notifications">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />)}</div>
      : groups.length === 0 ? <div className="py-14 text-center"><Inbox className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold text-slate-900">No notifications found</h2><p className="mt-1 text-sm text-slate-500">There are no items matching this view.</p></div>
      : <div className="space-y-7">{groups.map(([group, groupItems]) => <section key={group}><h2 className="mb-3 text-sm font-bold text-slate-500">{group}</h2><div className="space-y-3">{groupItems.map((item) => <NotificationRow key={item.id} item={item} busy={busy === item.notification.id} onMutate={mutate} />)}</div></section>)}</div>}
    {cursor ? <div className="flex justify-center"><button type="button" disabled={moreLoading} onClick={() => void load(filters, cursor, true)} className="premium-secondary-button inline-flex min-h-11 items-center gap-2">{moreLoading ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{moreLoading ? "Loading..." : "Load more"}</button></div> : null}
  </div>;
}

function FilterSelect({ label: emptyLabel, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="sr-only">{emptyLabel}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 text-sm premium-focus"><option value="">{emptyLabel}</option>{options.map((option) => <option key={option} value={option}>{label(option)}</option>)}</select></label>;
}

function NotificationRow({ item, busy, onMutate }: {
  item: Item;
  busy: boolean;
  onMutate: (id: string, action: "read" | "unread" | "archive" | "dismiss" | "acknowledge") => Promise<void>;
}) {
  const notice = item.notification;
  const acknowledgementPending = notice.requiresAcknowledgement && !item.acknowledgedAt;

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${item.readAt ? "border-campus-border bg-white" : "border-brand-200 bg-brand-50/50"}`}>
      <div className="flex gap-3">
        <span className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border ${priorityClass(notice.priority)}`}>
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div>
              <Link href={`/notifications/${notice.id}`} className={`premium-focus ${item.readAt ? "font-semibold text-slate-900" : "font-bold text-brand-950"}`}>
                {notice.title}
              </Link>
              <p className="mt-1 text-sm leading-6 text-slate-600">{notice.bodyPreview}</p>
            </div>
            <time className="shrink-0 text-xs text-slate-500">
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notice.createdAt))}
            </time>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700">{label(notice.sourceModule)}</span>
            <span className={`rounded-full border px-2.5 py-1 font-bold ${priorityClass(notice.priority)}`}>{label(notice.priority)}</span>
            {acknowledgementPending ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-900">Acknowledgement required</span> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {acknowledgementPending ? <button type="button" disabled={busy} onClick={() => void onMutate(notice.id, "acknowledge")} className="premium-primary-button min-h-11">Acknowledge</button> : null}
            <button type="button" disabled={busy} onClick={() => void onMutate(notice.id, item.readAt ? "unread" : "read")} className="premium-secondary-button min-h-11">{item.readAt ? "Mark unread" : "Mark read"}</button>
            {!item.archivedAt && !acknowledgementPending ? <button type="button" disabled={busy} onClick={() => void onMutate(notice.id, "archive")} className="premium-secondary-button inline-flex min-h-11 items-center gap-1.5"><Archive className="h-4 w-4" aria-hidden="true" />Archive</button> : null}
            {!notice.mandatory && !acknowledgementPending ? <button type="button" disabled={busy} onClick={() => void onMutate(notice.id, "dismiss")} className="min-h-11 rounded-md px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 premium-focus">Dismiss</button> : null}
            {busy ? <LoaderCircle className="my-auto h-4 w-4 animate-spin text-brand-600 motion-reduce:animate-none" aria-label="Updating notification" /> : null}
          </div>
        </div>
      </div>
    </article>
  );
}