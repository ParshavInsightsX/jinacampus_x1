import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";

export type SchoolCastCommunicationListItem = {
  id: string;
  type: string;
  category: string;
  priority: string;
  status: string;
  scheduledAtUtc: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  currentVersion: {
    title: string;
    summary: string | null;
    versionNo: number;
  } | null;
  createdBy: {
    displayName: string | null;
    firstName: string;
    lastName: string | null;
  };
  channelPlans: readonly { channel: string; status: string }[];
  _count: { recipientSnapshots: number; outboxItems: number };
};

function authorName(item: SchoolCastCommunicationListItem) {
  return item.createdBy.displayName
    ?? [item.createdBy.firstName, item.createdBy.lastName].filter(Boolean).join(" ");
}

function formattedDate(value: Date | null, timeZone: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

export function SchoolCastCommunicationList({
  items,
  timeZone,
  emptyTitle,
  emptyDescription,
  createHref,
}: {
  items: readonly SchoolCastCommunicationListItem[];
  timeZone: string;
  emptyTitle: string;
  emptyDescription: string;
  createHref?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={createHref ? "Create communication" : undefined}
        actionHref={createHref}
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const activityAt = item.publishedAt ?? item.scheduledAtUtc ?? item.createdAt;
        return (
          <article key={item.id} className="premium-card flex min-w-0 flex-col p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand-700">
                  {formatEnumLabel(item.type)} / {item.category}
                </p>
                <h2 className="mt-1 truncate text-sm font-semibold text-ink">
                  {item.currentVersion?.title ?? "Untitled communication"}
                </h2>
              </div>
              <StatusBadge value={item.status} />
            </div>
            {item.currentVersion?.summary ? (
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                {item.currentVersion.summary}
              </p>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
              <div>
                <dt className="text-slate-400">Audience</dt>
                <dd className="mt-1 font-semibold tabular-nums text-slate-700">
                  {item._count.recipientSnapshots || "Not resolved"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Priority</dt>
                <dd className="mt-1 font-semibold text-slate-700">
                  {formatEnumLabel(item.priority)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-400">Channels</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {item.channelPlans.map((plan) => (
                    <span
                      key={plan.channel}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-600"
                    >
                      {formatEnumLabel(plan.channel)}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="mt-auto flex items-end justify-between gap-3 pt-4">
              <p className="text-xs text-slate-400">
                {authorName(item)}<br />
                {formattedDate(activityAt, timeZone)}
              </p>
              <Link
                href={"/schoolcast/communications/" + item.id}
                className="premium-secondary-button min-h-11 px-3"
              >
                Open
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}