import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { SchoolCastCommunicationList } from "@/modules/schoolcast/components/communication-list";
import { listSchoolCastCommunications } from "@/modules/schoolcast/queries";

export default async function SchoolCastNoticesPage() {
  const ctx = await requireAuth();
  const items = await listSchoolCastCommunications(ctx, {
    types: ["NOTICE", "CIRCULAR", "EMERGENCY"],
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title="Notices and circulars"
        description="Author, review, schedule, and publish governed school communications."
        actionLabel="Create notice"
        actionHref="/schoolcast/notices/new"
      />
      <SchoolCastCommunicationList
        items={items}
        timeZone={ctx.timeZone ?? "Asia/Kolkata"}
        emptyTitle="No notices or circulars"
        emptyDescription="Create a scoped notice when communication is required."
        createHref="/schoolcast/notices/new"
      />
    </div>
  );
}