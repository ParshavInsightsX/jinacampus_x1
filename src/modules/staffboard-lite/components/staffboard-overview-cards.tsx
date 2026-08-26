import { CalendarDays, ClipboardCheck, ClipboardList, FileText, QrCode, UsersRound, WalletCards } from "lucide-react";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { getVisibleStaffboardModuleCards, type StaffboardModuleKey } from "@/modules/staffboard-lite/ui-config";
import { CardLink, ComingSoonPill } from "./staffboard-page-shell";

const icons: Record<StaffboardModuleKey, typeof UsersRound> = {
  staff: UsersRound,
  categories: WalletCards,
  attendance: ClipboardList,
  "my-attendance": CalendarDays,
  "my-card": WalletCards,
  scan: QrCode,
  credentials: QrCode,
  adjustments: ClipboardCheck,
  reports: FileText,
  leave: CalendarDays,
  "leave-review": ClipboardCheck
};

export function StaffboardOverviewCards({ permissions }: { permissions: ReadonlySet<PermissionCode> }) {
  const visibleModules = getVisibleStaffboardModuleCards(permissions);

  return (
    <section aria-label="StaffBoard Lite modules" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {visibleModules.map((module) => {
        const Icon = icons[module.key];
        return (
          <CardLink key={module.key} href={module.href ?? "#"}>
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                {module.status === "coming-soon" ? <ComingSoonPill /> : null}
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">{module.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
              </div>
            </div>
          </CardLink>
        );
      })}
    </section>
  );
}
