"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { acknowledgeSchoolCastCommunicationAction, markSchoolCastInboxReadAction } from "@/modules/schoolcast/actions";

export type InboxItem = { id: string; type: string; title: string; message: string; actionUrl: string | null; priority: string; acknowledgementRequired: boolean; readAt: Date | null; acknowledgedAt: Date | null; createdAt: Date };

export function InboxList({ items }: { items: readonly InboxItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function act(work: () => Promise<unknown>) { startTransition(async () => { await work(); router.refresh(); }); }
  return <div className="space-y-3" aria-busy={pending}>
    {items.map((item) => <article key={item.id} className={`rounded-lg border p-4 ${item.readAt ? "border-slate-200 bg-white" : "border-brand-200 bg-brand-50"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-brand-700">{item.type.replaceAll("_", " ")}</span><span className="text-xs text-slate-400">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span></div><h2 className="mt-2 text-sm font-semibold text-ink">{item.title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p></div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!item.readAt ? <button type="button" disabled={pending} onClick={() => act(() => markSchoolCastInboxReadAction({ notificationId: item.id }))} className="premium-secondary-button min-h-11 px-3">Mark read</button> : null}
          {item.acknowledgementRequired && !item.acknowledgedAt ? <button type="button" disabled={pending} onClick={() => act(() => acknowledgeSchoolCastCommunicationAction({ notificationId: item.id }))} className="premium-primary-button min-h-11 px-3">Acknowledge</button> : null}
          {item.actionUrl ? <Link href={item.actionUrl} className="premium-secondary-button min-h-11 px-3">Open</Link> : null}
        </div>
      </div>
      {item.acknowledgedAt ? <p className="mt-3 text-xs font-semibold text-emerald-700">Acknowledged</p> : null}
    </article>)}
  </div>;
}