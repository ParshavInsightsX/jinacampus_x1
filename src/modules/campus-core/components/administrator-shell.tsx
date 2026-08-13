import { CirclePlus, KeyRound, LayoutDashboard, School, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";

const administratorNavItems: readonly {
  href: string;
  label: string;
  Icon: LucideIcon;
  requiresPrincipalRecoveryAccess?: boolean;
}[] = [
  { href: "/administrator", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/administrator/schools", label: "Schools", Icon: School },
  { href: "/administrator/schools/create", label: "Create School", Icon: CirclePlus },
  {
    href: "/administrator/principal-recovery",
    label: "Principal Recovery",
    Icon: KeyRound,
    requiresPrincipalRecoveryAccess: true
  },
  { href: "/administrator/profile", label: "Profile", Icon: UserRound }
];

function AdministratorNavigationLinks({
  activeHref,
  canManagePrincipalRecovery,
  desktop = false
}: {
  activeHref?: string;
  canManagePrincipalRecovery: boolean;
  desktop?: boolean;
}) {
  return administratorNavItems
    .filter((item) => !item.requiresPrincipalRecoveryAccess || canManagePrincipalRecovery)
    .map((item) => {
    const isActive = activeHref === item.href;
    const Icon = item.Icon;

    if (desktop) {
      return (
        <li
          key={item.href}
          className="desktop-dock-item relative flex w-[clamp(6rem,8vw,7.5rem)] items-end justify-center"
          data-dock-module="administrator"
        >
          <Link
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className="desktop-dock-button relative flex min-h-[4.75rem] w-full flex-col items-center justify-end gap-1 rounded-[1.15rem] px-2 pb-1 pt-1 text-center text-ink premium-focus"
          >
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.95rem] border ${
              isActive
                ? "border-brand-500 bg-brand-500 text-white shadow-[0_10px_24px_rgba(36,87,230,0.32)]"
                : "border-white/90 bg-white text-brand-700 shadow-[0_7px_18px_rgba(11,22,56,0.12)]"
            }`}>
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className={`block max-w-full truncate text-[11px] font-semibold leading-4 ${isActive ? "text-brand-700" : "text-slate-700"}`}>
              {item.label}
            </span>
            {isActive ? <span className="absolute -bottom-1 h-1 w-5 rounded-full bg-brand-500" aria-hidden="true" /> : null}
          </Link>
        </li>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={[
          "rounded-lg px-3 py-2 text-sm font-semibold transition premium-focus",
          isActive
            ? "border border-brand-100 bg-brand-50 text-brand-700 shadow-sm"
            : "text-slate-700 hover:bg-brand-50 hover:text-brand-700"
        ].join(" ")}
      >
        {item.label}
      </Link>
    );
  });
}

export function AdministratorShell({
  ctx,
  children,
  activeHref
}: {
  ctx: PlatformAdministratorContext;
  children: ReactNode;
  activeHref?: string;
}) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-app-background text-ink">
      <header className="sticky top-0 z-30 border-b border-campus-border bg-white shadow-sm lg:border-white/70 lg:bg-white/70 lg:shadow-[0_10px_36px_rgba(11,22,56,0.08)] lg:backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:hidden">
          <div className="flex min-w-0 items-center gap-4">
            <BrandLogo className="hidden w-44 shrink-0 sm:block" priority />
            <div className="min-w-0 border-l-0 sm:border-l sm:border-campus-border sm:pl-4">
              <p className="premium-muted-chip">JinaCampus Administrator Portal</p>
              <h1 className="mt-2 text-xl font-semibold text-ink">School and tenant governance</h1>
              <p className="mt-1 truncate text-sm text-slate-500">Signed in as {ctx.email}</p>
            </div>
          </div>
          <form action="/api/auth/administrator-logout" method="post">
            <button className="premium-secondary-button w-full premium-focus sm:w-auto">Logout</button>
          </form>
        </div>

        <div className="mx-auto hidden min-h-[5.5rem] w-full max-w-[100rem] items-center justify-between gap-5 px-7 lg:flex xl:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <BrandLogo className="w-44 shrink-0 xl:w-48" priority />
            <span className="h-10 w-px shrink-0 bg-campus-border" aria-hidden="true" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Administrator Portal
              </p>
              <h1 className="truncate text-base font-semibold text-ink">School and tenant governance</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-[1.65rem] border border-white/90 bg-white/65 p-1.5 pl-4 shadow-[0_16px_42px_rgba(11,22,56,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl">
            <div className="min-w-0 text-right">
              <p className="text-[11px] font-medium text-slate-500">Signed in</p>
              <p className="max-w-[15rem] truncate text-xs font-semibold text-ink">{ctx.email}</p>
            </div>
            <form action="/api/auth/administrator-logout" method="post">
              <button className="premium-secondary-button rounded-[1.2rem] border-transparent bg-white/90 premium-focus">Logout</button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[100rem] gap-6 px-4 py-6 sm:px-6 lg:block lg:px-7 lg:pb-40 xl:px-10">
        <aside className="premium-card h-max p-3 lg:hidden">
          <nav aria-label="Administrator navigation" className="grid gap-2">
            <AdministratorNavigationLinks
              activeHref={activeHref}
              canManagePrincipalRecovery={ctx.canManagePrincipalRecovery}
            />
            <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-xs leading-5 text-slate-500">
              Platform administrators manage school records only. School workspaces and school user sessions remain separate.
            </div>
          </nav>
        </aside>
        <main className="min-w-0 space-y-6">{children}</main>
      </div>

      <div className="desktop-dock-shell pointer-events-none fixed bottom-5 left-0 right-0 z-[60] hidden justify-center px-4 lg:flex" data-administrator-desktop-dock="true">
        <nav
          aria-label="Administrator primary navigation"
          className="pointer-events-auto w-fit max-w-[calc(100vw-2rem)] rounded-[1.75rem] border border-white/90 bg-white/75 px-3 py-2.5 shadow-[0_24px_70px_rgba(11,22,56,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl"
        >
          <ul className="m-0 flex min-h-[4.75rem] list-none items-end justify-center gap-1 p-0">
            <AdministratorNavigationLinks
              activeHref={activeHref}
              canManagePrincipalRecovery={ctx.canManagePrincipalRecovery}
              desktop
            />
          </ul>
        </nav>
      </div>
    </div>
  );
}
