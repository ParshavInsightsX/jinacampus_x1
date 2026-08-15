import Link from "next/link";

import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { requireAuth } from "@/lib/auth/require-auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { HomeworkActions } from "@/modules/schoolcast/components/homework-actions";
import { SchoolCastAttachmentPanel } from "@/modules/schoolcast/components/schoolcast-attachment-panel";
import { getSchoolCastHomeworkDetail } from "@/modules/schoolcast/queries";

export default async function SchoolCastHomeworkDetailPage({
  params,
}: {
  params: Promise<{ homeworkItemId: string }>;
}) {
  const ctx = await requireAuth();
  const { homeworkItemId } = await params;
  const workspace = await getSchoolCastHomeworkDetail(ctx, homeworkItemId);
  const { item } = workspace;
  const version = item.currentVersion;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={version?.title ?? formatEnumLabel(item.workType)}
          description={item.classSection.displayName + " / " + item.subject.code + " - " + item.subject.name}
        />
        <Link href="/schoolcast/homework" className="premium-secondary-button w-full sm:w-auto">
          Back to homework
        </Link>
      </div>

      <article className="premium-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={item.status} />
          <StatusBadge value={item.workType} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Assignment date</dt>
            <dd className="mt-1 font-semibold text-slate-700">
              {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(version!.assignmentDate)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Completion due</dt>
            <dd className="mt-1 font-semibold text-slate-700">
              {version?.completionDueAt
                ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(version.completionDueAt)
                : "Not set"}
            </dd>
          </div>
        </dl>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {version?.instructionsSanitized}
        </p>
        {version?.teacherRemarks ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {version.teacherRemarks}
          </p>
        ) : null}
        <div className="mt-5">
          <HomeworkActions homeworkItemId={item.id} status={item.status} />
        </div>
      </article>

      <SchoolCastAttachmentPanel
        homeworkItemId={item.id}
        attachments={workspace.attachments}
        canUpload={workspace.capabilities.canUpload}
        maxBytes={env.SCHOOLCAST_ATTACHMENT_MAX_BYTES}
      />
    </div>
  );
}