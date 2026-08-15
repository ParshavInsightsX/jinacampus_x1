import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { HomeworkComposer } from "@/modules/schoolcast/components/homework-composer";
import { getSchoolCastHomeworkComposerOptions } from "@/modules/schoolcast/queries";

export default async function NewSchoolCastHomeworkPage() {
  const ctx = await requireAuth();
  const options = await getSchoolCastHomeworkComposerOptions(ctx);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Create homework or classwork"
        description="The available classes and subjects are derived from the teacher assignment and active academic context."
      />
      {options.assignments.length === 0 ? (
        <EmptyState
          title="No assigned class-subject scope"
          description="Ask the Principal to assign this teacher to an active class-section and subject before creating work."
        />
      ) : (
        <HomeworkComposer {...options} />
      )}
    </div>
  );
}