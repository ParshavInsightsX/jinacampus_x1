import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { HomeworkActions } from "@/modules/schoolcast/components/homework-actions";
import { listSchoolCastHomework } from "@/modules/schoolcast/queries";

export default async function SchoolCastHomeworkPage() {
  const ctx = await requireAuth();
  const items = await listSchoolCastHomework(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Everyday homework and classwork"
        description="Assigned teachers publish text and private supported media to the relevant class guardians."
        actionLabel="Create homework"
        actionHref="/schoolcast/homework/new"
      />
      {items.length === 0 ? (
        <EmptyState
          title="No homework or classwork yet"
          description="Only assigned class-section and subject combinations are available to teachers."
          actionLabel="Create homework"
          actionHref="/schoolcast/homework/new"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="premium-card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-700">
                    {item.classSection.displayName} / {item.subject.code}
                  </p>
                  <h2 className="mt-1 truncate text-sm font-semibold text-ink">
                    {item.currentVersion?.title ?? formatEnumLabel(item.workType)}
                  </h2>
                </div>
                <StatusBadge value={item.status} />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Assigned {item.currentVersion
                  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(item.currentVersion.assignmentDate)
                  : "date unavailable"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {item.communication?._count.recipientSnapshots ?? 0} recipients / {item.communication?._count.outboxItems ?? 0} external deliveries
              </p>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
                <HomeworkActions homeworkItemId={item.id} status={item.status} />
                <Link href={"/schoolcast/homework/" + item.id} className="premium-secondary-button min-h-11 px-3">
                  Open
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}