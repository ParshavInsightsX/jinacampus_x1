"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { CalendarDays, KeyRound, LayoutGrid, MapPin, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

import { InstitutionLogo } from "@/components/brand/institution-logo";
import { PwaInstallControl } from "@/components/pwa/pwa-install-control";

import type { AppShellBranding } from "./branding";
import type { NavbarSessionContext } from "./navbar-types";
import { getActiveNavHref, isNavItemActive, type NavGroup } from "./navigation";
import { NavbarSignOutButton } from "./navbar-sign-out-button";

type MobileNavigationDrawerProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  groups: readonly NavGroup[];
  context: NavbarSessionContext;
  branding: AppShellBranding;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function MobileNavigationDrawer({
  isOpen,
  onOpenChange,
  groups,
  context,
  branding,
  returnFocusRef
}: MobileNavigationDrawerProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);
  const wasOpenRef = useRef(false);
  const activeHref = getActiveNavHref(groups, pathname);
  const branchLabel = branding.branchName
    ? `${branding.branchName}${branding.branchCode ? ` (${branding.branchCode})` : ""}`
    : context.hasActiveBranch
      ? "Selected branch"
      : "Branch not selected";
  const academicYearLabel =
    branding.academicYearName ?? (context.hasActiveAcademicYear ? "Active academic year" : "Academic year not active");

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      onOpenChange(false);
    }
  }, [onOpenChange, pathname]);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) returnFocusRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen, returnFocusRef]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [isOpen, onOpenChange]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-ink/45 lg:hidden"
      data-mobile-navigation-drawer="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <aside
        ref={dialogRef}
        id="mobile-application-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="Application navigation"
        className="flex h-full w-[min(23rem,calc(100vw-1.25rem))] flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-elevated motion-slide-in-left"
      >
        <div className="flex min-h-16 items-center gap-3 border-b border-campus-border px-4">
          <InstitutionLogo name={branding.institutionName} logoUrl={branding.logoUrl} className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{branding.institutionName}</p>
            <p className="truncate text-xs text-slate-500">JinaCampus workspace</p>
          </div>
          <button type="button" onClick={() => onOpenChange(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-ink premium-focus" aria-label="Close application navigation">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-campus-border bg-surface-muted p-3 text-xs">
          <div className="min-w-0 rounded-lg border border-campus-border bg-white p-2.5">
            <p className="flex items-center gap-1.5 text-slate-500"><MapPin className="h-3.5 w-3.5 text-campus-teal" aria-hidden="true" />Branch</p>
            <p className="mt-1 truncate font-semibold text-ink" title={branchLabel}>{branchLabel}</p>
          </div>
          <div className="min-w-0 rounded-lg border border-campus-border bg-white p-2.5">
            <p className="flex items-center gap-1.5 text-slate-500"><CalendarDays className="h-3.5 w-3.5 text-campus-gold" aria-hidden="true" />Academic year</p>
            <p className="mt-1 truncate font-semibold text-ink" title={academicYearLabel}>{academicYearLabel}</p>
          </div>
        </div>

        <nav className="premium-nav-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Permission-aware application navigation">
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.title} aria-labelledby={`mobile-nav-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
                <h2 id={`mobile-nav-${group.title.replace(/\s+/g, "-").toLowerCase()}`} className="px-2 text-xs font-semibold text-slate-500">{group.title}</h2>
                <div className="mt-1.5 space-y-1">
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item, pathname, activeHref);
                    return (
                      <Link key={item.href} href={item.href} onClick={() => onOpenChange(false)} aria-current={isActive ? "page" : undefined} className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition premium-focus ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100 hover:text-ink"}`}>
                        {item.title}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-campus-border p-3">
          <div className="mb-2 rounded-lg bg-surface-muted p-3">
            <p className="truncate text-sm font-semibold text-ink">{context.userName?.trim() || context.userEmail}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{context.userEmail}</p>
            {branding.roleLabels[0] ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{branding.roleLabels[0]}</p> : null}
          </div>
          <Link href="/account/change-password" onClick={() => onOpenChange(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 premium-focus">
            <KeyRound className="h-4 w-4" aria-hidden="true" />Account security
          </Link>
          <Link href="/account/workspaces" onClick={() => onOpenChange(false)} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 premium-focus">
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />Switch workspace
          </Link>
          <PwaInstallControl />
          <form action="/api/auth/logout" method="post" className="mt-1 border-t border-campus-border pt-1">
            <NavbarSignOutButton mobile />
          </form>
        </div>
      </aside>
    </div>,
    document.body
  );
}
