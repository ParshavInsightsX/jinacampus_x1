import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { CommunicationComposer } from "@/modules/schoolcast/components/communication-composer";
import { getSchoolCastComposerOptions } from "@/modules/schoolcast/queries";

export default async function NewSchoolCastCommunicationPage() {
  const ctx = await requireAuth();
  const options = await getSchoolCastComposerOptions(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="New communication"
        description="Compose content, select a server-resolved audience, and prepare delivery channels before approval."
      />
      <CommunicationComposer {...options} />
    </div>
  );
}