"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { KeyRound, LayoutGrid, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

import { InstitutionLogo } from "@/components/brand/institution-logo";
import { PwaInstallControl } from "@/components/pwa/pwa-install-control";

import type { AppShellBranding } from "./branding";
import type { NavbarSessionContext } from "./navbar-types";
import { getActiveNavHref, isNavItemActive, type NavGroup } from "./navigation";
import { NavigationIcon } from "./navigation-icon";
import { NavbarSignOutButton } from "./navbar-sign-out-button";

type MobileModuleSheetProps = {
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

export function MobileModuleSheet({
  isOpen,
  onOpenChange,
  groups,
  context,
  branding,
  returnFocusRef
}: MobileModuleSheetProps) {
  const pathname = usePathname();
  const sheetRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);
  const wasOpenRef = useRef(false);
  const activeHref = getActiveNavHref(groups, pathname);

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
      sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
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
      className="fixed inset-0 z-[85] flex items-end bg-ink/45 px-2 pt-12 lg:hidden"
      data-mobile-module-overlay="true"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section
        ref={sheetRef}
        id="mobile-module-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-module-sheet-title"
        className="mobile-sheet-surface mx-auto flex max-h-[min(48rem,calc(100dvh-3rem))] w-full max-w-xl flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
        data-mobile-module-sheet="true"
      >
        <div className="px-4 pt-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
          <div className="flex min-h-14 items-center gap-3 border-b border-campus-border pb-3">
            <InstitutionLogo name={branding.institutionName} logoUrl={branding.logoUrl} className="h-10 w-10" />
            <div className="min-w-0 flex-1">
              <h2 id="mobile-module-sheet-title" className="text-base font-semibold text-ink">More</h2>
              <p className="truncate text-xs text-slate-500">{branding.institutionName}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink premium-focus"
              aria-label="Close all navigation"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <nav className="premium-nav-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-label="All permitted destinations">
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.title} aria-labelledby={`mobile-module-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
                <h3 id={`mobile-module-${group.title.replace(/\s+/g, "-").toLowerCase()}`} className="text-xs font-semibold text-slate-500">
                  {group.title}
                </h3>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item, pathname, activeHref);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => onOpenChange(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-semibold transition premium-focus ${
                          isActive
                            ? "border-brand-200 bg-brand-50 text-brand-800"
                            : "border-campus-border bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-brand-600 text-white" : "bg-surface-muted text-brand-700"}`}>
                          <NavigationIcon href={item.href} className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 break-words leading-5">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="border-t border-campus-border bg-white/95 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink">{context.userName?.trim() || context.userEmail}</p>
              <p className="truncate text-[11px] text-slate-500">{branding.roleLabels[0] ?? "School user"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/account/change-password" onClick={() => onOpenChange(false)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-campus-border bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 premium-focus">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Security
            </Link>
            <Link href="/account/workspaces" onClick={() => onOpenChange(false)} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-campus-border bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 premium-focus">
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              Workspaces
            </Link>
          </div>
          <PwaInstallControl />
          <form action="/api/auth/logout" method="post" className="border-t border-campus-border pt-1">
            <NavbarSignOutButton mobile />
          </form>
        </div>
      </section>
    </div>,
    document.body
  );
}
