"use client";

import { Building2, CalendarDays, ChevronDown, LayoutGrid, MapPin } from "lucide-react";
import Link from "next/link";

import type { AppShellBranding } from "./branding";
import type { NavbarSessionContext } from "./navbar-types";
import { NavbarPopover } from "./navbar-popover";

type NavbarContextMenuProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  onOpenChange: (isOpen: boolean) => void;
};

export function NavbarContextMenu({ context, branding, onOpenChange }: NavbarContextMenuProps) {
  const branchLabel = branding.branchName
    ? `${branding.branchName}${branding.branchCode ? ` (${branding.branchCode})` : ""}`
    : context.hasActiveBranch
      ? "Selected branch"
      : "Branch not selected";
  const academicYearLabel =
    branding.academicYearName ?? (context.hasActiveAcademicYear ? "Active academic year" : "Academic year not active");

  return (
    <NavbarPopover
      accessibleLabel="Open school context"
      dataAttribute="school-context"
      panelRole="dialog"
      onOpenChange={onOpenChange}
      buttonClassName="jc-motion-interactive flex min-h-14 max-w-[28rem] items-center gap-3 rounded-[1.25rem] border border-transparent bg-transparent px-3 text-left text-slate-700 hover:bg-white/90 premium-focus"
      panelClassName="jc-glass-elevated absolute right-0 top-[calc(100%+0.85rem)] z-20 w-[min(23rem,calc(100vw-2rem))] rounded-[1.25rem] border p-3"
      trigger={(isOpen) => (
        <>
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-slate-500">Academic year</span>
              <span className="block truncate text-xs font-semibold text-ink">{academicYearLabel}</span>
            </span>
          </span>
          <span className="hidden h-8 w-px bg-campus-border xl:block" aria-hidden="true" />
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-slate-500">Branch</span>
              <span className="block max-w-[7.5rem] truncate text-xs font-semibold text-ink xl:max-w-[11rem]">{branchLabel}</span>
            </span>
          </span>
          <ChevronDown className={`jc-motion-interactive h-4 w-4 shrink-0 text-slate-500 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
        </>
      )}
    >
      <p className="px-1 text-xs font-semibold text-slate-500">Current workspace</p>
      <dl className="mt-2 divide-y divide-campus-border rounded-lg border border-campus-border bg-surface-muted px-3">
        <div className="flex gap-3 py-3">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">School</dt>
            <dd className="truncate text-sm font-semibold text-ink" title={branding.institutionName}>{branding.institutionName}</dd>
          </div>
        </div>
        <div className="flex gap-3 py-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-campus-teal" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Branch</dt>
            <dd className="truncate text-sm font-semibold text-ink" title={branchLabel}>{branchLabel}</dd>
          </div>
        </div>
        <div className="flex gap-3 py-3">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-campus-gold" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Academic year</dt>
            <dd className="truncate text-sm font-semibold text-ink" title={academicYearLabel}>{academicYearLabel}</dd>
          </div>
        </div>
      </dl>
      <Link href="/account/workspaces" className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-campus-border bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 premium-focus">
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        Review workspace access
      </Link>
    </NavbarPopover>
  );
}
