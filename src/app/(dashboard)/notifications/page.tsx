import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { getSchoolCastDeploymentPolicy } from "@/modules/schoolcast/deployment-policy";
import { InboxList } from "@/modules/schoolcast/components/inbox-list";
import { PreferenceForm } from "@/modules/schoolcast/components/preference-form";
import { getSchoolCastInbox } from "@/modules/schoolcast/services/inbox.service";
import { getOwnSchoolCastPreference } from "@/modules/schoolcast/services/preference.service";

export default async function NotificationCentrePage() {
  const ctx = await requireAuth();
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const [items, preference] = await Promise.all([
    getSchoolCastInbox(ctx),
    getOwnSchoolCastPreference(ctx),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Your private in-application messages, acknowledgements, and delivery preferences."
      />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Inbox</h2>
          <p className="mt-1 text-sm text-slate-500">Only notifications addressed to your signed-in user account are shown.</p>
        </div>
        {items.length === 0 ? (
          <EmptyState title="No notifications" description="New SchoolCast notices and homework will appear here when published to you." />
        ) : (
          <InboxList items={items} />
        )}
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Communication preferences</h2>
          <p className="mt-1 text-sm text-slate-500">Only channels enabled for this deployment are available.</p>
        </div>
        <PreferenceForm preference={preference} externalChannelsAvailable={deploymentPolicy.externalChannels} />
      </section>
    </div>
  );
}