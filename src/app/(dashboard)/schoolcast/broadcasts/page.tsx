import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { SchoolCastCommunicationList } from "@/modules/schoolcast/components/communication-list";
import { listSchoolCastCommunications } from "@/modules/schoolcast/queries";

export default async function SchoolCastBroadcastsPage() {
  const ctx = await requireAuth();
  const items = await listSchoolCastCommunications(ctx, { types: ["BROADCAST"] });
  return (
    <div className="space-y-5">
      <PageHeader
        title="Broadcasts"
        description="Branch-scoped broadcasts with immutable content versions and recipient snapshots."
        actionLabel="Create broadcast"
        actionHref="/schoolcast/broadcasts/new"
      />
      <SchoolCastCommunicationList
        items={items}
        timeZone={ctx.timeZone ?? "Asia/Kolkata"}
        emptyTitle="No broadcasts"
        emptyDescription="Create a broadcast only for an authorised operational need."
        createHref="/schoolcast/broadcasts/new"
      />
    </div>
  );
}