import {
  BookOpen,
  CircleArrowUp,
  CalendarClock,
  Contact,
  GraduationCap,
  Layers3,
  LibraryBig,
  School,
  UsersRound
} from "lucide-react";
import { forbidden } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { ACADEMIA_PERMISSIONS } from "@/modules/academia/permissions";
import { getVisibleAcademiaModuleCards, type AcademiaModuleKey } from "@/modules/academia/ui-config";
import { CardLink, ComingSoonPill, PageHeader } from "@/modules/academia/components/academia-page-shell";

const icons: Record<AcademiaModuleKey, typeof School> = {
  overview: School,
  setup: Layers3,
  classes: School,
  sections: Layers3,
  "class-sections": GraduationCap,
  subjects: BookOpen,
  students: UsersRound,
  guardians: Contact,
  enrollments: LibraryBig,
  promotions: CircleArrowUp,
  attendance: CalendarClock
};

export default async function AcademiaOverviewPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!ACADEMIA_PERMISSIONS.some((permission) => permissions.has(permission))) {
    throw forbidden("FORBIDDEN_ACADEMIA_ACCESS");
  }
  const visibleModules = getVisibleAcademiaModuleCards(permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academia"
        description="Complete academic setup, register students with primary guardians and class assignments, and manage daily attendance."
      />

      <section aria-label="Academia modules" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleModules.map((module) => {
          const Icon = icons[module.key];
          const content = (
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                {module.status === "coming-soon" ? <ComingSoonPill /> : null}
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
              </div>
            </div>
          );

          return module.href ? (
            <CardLink key={module.key} href={module.href}>
              {content}
            </CardLink>
          ) : (
            <div key={module.key} className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5">
              {content}
            </div>
          );
        })}
      </section>
    </div>
  );
}
