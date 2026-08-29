import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness, ClipboardCheck, GraduationCap, Settings } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  getAvailableSchoolWorkspaces,
  type SchoolWorkspace
} from "@/modules/campus-core/workspaces";
import { getSchoolWorkspaceAccess } from "@/modules/campus-core/workspace-access";

const workspaceIcon = {
  administration: Settings,
  office: BriefcaseBusiness,
  teaching: GraduationCap,
  "self-attendance": ClipboardCheck
} satisfies Record<SchoolWorkspace["id"], typeof Settings>;

export default async function WorkspacesPage() {
  const ctx = await requireAuth();
  const access = await getSchoolWorkspaceAccess(ctx);
  const workspaces = getAvailableSchoolWorkspaces(
    ctx.roleCodes ?? [],
    access.permissions,
    access.features
  );

  return (
    <main className="min-h-dvh bg-app-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 transition hover:text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <header className="mt-4">
          <BrandLogo className="mb-6 w-56" priority />
          <h1 className="text-2xl font-semibold text-ink">Choose a workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Only workspaces allowed by your current school roles and permissions are shown.
          </p>
        </header>

        {workspaces.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {workspaces.map((workspace) => {
              const Icon = workspaceIcon[workspace.id];
              return (
                <Link
                  key={workspace.id}
                  href={workspace.href}
                  className="group min-h-40 rounded-lg border border-campus-border bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-elevated focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <Icon className="h-6 w-6 text-brand-600" aria-hidden="true" />
                  <h2 className="mt-4 text-base font-semibold text-ink group-hover:text-brand-700">
                    {workspace.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{workspace.description}</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p role="alert" className="mt-6 border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900">
            No operational workspace is available. Ask your Principal or administrator to review your role and branch access.
          </p>
        )}
      </div>
    </main>
  );
}
