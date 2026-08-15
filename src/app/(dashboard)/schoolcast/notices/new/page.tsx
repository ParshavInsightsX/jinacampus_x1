import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { CommunicationComposer } from "@/modules/schoolcast/components/communication-composer";
import { getSchoolCastComposerOptions } from "@/modules/schoolcast/queries";

export default async function NewSchoolCastNoticePage() {
  const ctx = await requireAuth();
  const options = await getSchoolCastComposerOptions(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Create notice"
        description="Content remains a draft until the configured approval and publication gates pass."
      />
      <CommunicationComposer {...options} defaultType="NOTICE" />
    </div>
  );
}