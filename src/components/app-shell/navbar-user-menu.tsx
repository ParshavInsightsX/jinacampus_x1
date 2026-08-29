"use client";

import { ChevronDown, KeyRound, LayoutGrid, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { brandingInitials, type AppShellBranding } from "./branding";
import type { NavbarSessionContext } from "./navbar-types";
import { NavbarPopover } from "./navbar-popover";
import { NavbarSignOutButton } from "./navbar-sign-out-button";

type NavbarUserMenuProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  compact?: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function NavbarUserMenu({ context, branding, compact = false, onOpenChange }: NavbarUserMenuProps) {
  const displayName = context.userName?.trim() || context.userEmail;
  const visibleRoles = branding.roleLabels.slice(0, 2);
  const additionalRoleCount = Math.max(branding.roleLabels.length - visibleRoles.length, 0);

  return (
    <NavbarPopover
      accessibleLabel="Open account menu"
      dataAttribute="account"
      panelRole="dialog"
      onOpenChange={onOpenChange}
      buttonClassName={compact
        ? "jc-motion-interactive flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-campus-border bg-white px-1.5 text-slate-700 shadow-sm hover:border-brand-200 hover:bg-brand-50 premium-focus"
        : "jc-motion-interactive flex min-h-14 max-w-[14rem] items-center gap-2 rounded-[1.25rem] border border-transparent bg-transparent px-2.5 text-slate-700 hover:bg-white/90 premium-focus"}
      panelClassName={compact
        ? "jc-glass-elevated absolute right-0 top-[calc(100%+0.6rem)] z-20 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border p-2"
        : "jc-glass-elevated absolute right-0 top-[calc(100%+0.85rem)] z-20 w-[min(20rem,calc(100vw-1.5rem))] rounded-[1.25rem] border p-2"}
      trigger={(isOpen) => (
        <>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {brandingInitials(displayName)}
          </span>
          {compact ? null : (
            <span className="hidden min-w-0 text-left xl:block">
              <span className="block truncate text-xs font-semibold text-ink">{displayName}</span>
              <span className="block truncate text-[11px] text-slate-500">{visibleRoles[0] ?? "School user"}</span>
            </span>
          )}
          {compact ? null : <ChevronDown className={`jc-motion-interactive hidden h-4 w-4 shrink-0 xl:block ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />}
        </>
      )}
    >
      <div className="rounded-lg bg-surface-muted p-3">
        <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{context.userEmail}</p>
        {visibleRoles.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Assigned roles">
            {visibleRoles.map((role) => (
              <span key={role} className="inline-flex min-h-7 items-center gap-1 rounded-full border border-brand-100 bg-white px-2 text-xs font-semibold text-brand-700">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {role}
              </span>
            ))}
            {additionalRoleCount > 0 ? <span className="inline-flex min-h-7 items-center rounded-full bg-white px-2 text-xs text-slate-600">+{additionalRoleCount}</span> : null}
          </div>
        ) : null}
      </div>
      <Link href="/account/change-password" className="mt-2 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 premium-focus">
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        Account security
      </Link>
      <Link href="/account/workspaces" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 premium-focus">
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        Switch workspace
      </Link>
      <div className="my-1 border-t border-campus-border" />
      <form action="/api/auth/logout" method="post">
        <NavbarSignOutButton />
      </form>
    </NavbarPopover>
  );
}
