import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { CommunicationComposer } from "@/modules/schoolcast/components/communication-composer";
import { getSchoolCastComposerOptions } from "@/modules/schoolcast/queries";

export default async function NewSchoolCastBroadcastPage() {
  const ctx = await requireAuth();
  const options = await getSchoolCastComposerOptions(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Create broadcast"
        description="Preview audience scope and channel readiness before submitting this broadcast."
      />
      <CommunicationComposer {...options} defaultType="BROADCAST" />
    </div>
  );
}