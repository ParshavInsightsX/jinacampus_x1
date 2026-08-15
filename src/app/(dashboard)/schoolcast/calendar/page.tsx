import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getSchoolCastCalendar } from "@/modules/schoolcast/queries";

export default async function SchoolCastCalendarPage() {
  const ctx = await requireAuth();
  const workspace = await getSchoolCastCalendar(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Communication calendar"
        description={"Upcoming institutional calendar events consumed from CampusCore for " + workspace.context.branchName + "."}
      />
      {workspace.canManage ? (
        <div className="flex justify-end">
          <Link href="/campus-core/calendar" className="premium-secondary-button w-full sm:w-auto">
            Manage institutional calendar
          </Link>
        </div>
      ) : null}
      {workspace.entries.length === 0 ? (
        <EmptyState
          title="No upcoming calendar events"
          description="SchoolCast consumes active calendar data from CampusCore and does not duplicate it."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {workspace.entries.map((entry) => (
            <article key={entry.id} className="premium-card p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">{entry.name}</h2>
                <StatusBadge value={entry.entryType} />
              </div>
              {entry.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{entry.description}</p> : null}
              <p className="mt-3 text-xs text-slate-500">
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(entry.startDate)}
                {entry.endDate.getTime() !== entry.startDate.getTime()
                  ? " - " + new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(entry.endDate)
                  : ""}
              </p>
              <p className="mt-2 text-xs font-semibold text-brand-700">
                {entry.audiences.map(formatEnumLabel).join(", ")}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}