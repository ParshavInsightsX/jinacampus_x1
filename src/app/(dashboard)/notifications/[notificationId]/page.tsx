import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/require-auth";
import { NotificationDetailActions } from "@/modules/notifications/components/notification-detail-actions";
import { getInAppNotificationForUser } from "@/modules/notifications/queries";

export const dynamic = "force-dynamic";
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

export default async function NotificationDetailPage({ params }: { params: Promise<{ notificationId: string }> }) {
  const ctx = await requireAuth();
  const { notificationId } = await params;
  let item;
  try { item = await getInAppNotificationForUser(ctx, notificationId); } catch { notFound(); }
  const notification = item.notification;
  return <div className="mx-auto max-w-3xl space-y-5">
    <Link href="/notifications" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-700 premium-focus">Back to notifications</Link>
    <article className="rounded-lg border border-campus-border bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{label(notification.sourceModule)}</span><span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">{label(notification.category)}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">{label(notification.priority)}</span></div>
      <h1 className="mt-5 text-2xl font-bold text-brand-950 sm:text-3xl">{notification.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-700">{notification.bodyPreview}</p>
      <dl className="mt-6 grid gap-3 border-t border-campus-border pt-5 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-slate-500">Published</dt><dd className="mt-1 text-slate-900">{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(notification.publishedAt ?? notification.createdAt)}</dd></div><div><dt className="font-semibold text-slate-500">Status</dt><dd className="mt-1 text-slate-900">{item.acknowledgedAt ? "Acknowledged" : item.readAt ? "Read" : "Unread"}</dd></div></dl>
      <div className="mt-6 border-t border-campus-border pt-5"><NotificationDetailActions notificationId={notification.id} deepLink={notification.deepLink} mandatory={notification.mandatory} requiresAcknowledgement={notification.requiresAcknowledgement} initiallyRead={Boolean(item.readAt)} initiallyAcknowledged={Boolean(item.acknowledgedAt)} initiallyArchived={Boolean(item.archivedAt)} /></div>
    </article>
  </div>;
}