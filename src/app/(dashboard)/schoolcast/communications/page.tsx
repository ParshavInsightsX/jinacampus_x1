import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { SchoolCastCommunicationList } from "@/modules/schoolcast/components/communication-list";
import { listSchoolCastCommunications } from "@/modules/schoolcast/queries";

export default async function SchoolCastCommunicationsPage() {
  const ctx = await requireAuth();
  const items = await listSchoolCastCommunications(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Communications"
        description="All permission-scoped notices, circulars, broadcasts, and emergency messages for the active workspace."
        actionLabel="Create communication"
        actionHref="/schoolcast/communications/new"
      />
      <SchoolCastCommunicationList
        items={items}
        timeZone={ctx.timeZone ?? "Asia/Kolkata"}
        emptyTitle="No communications found"
        emptyDescription="Create the first SchoolCast communication for this branch."
        createHref="/schoolcast/communications/new"
      />
    </div>
  );
}