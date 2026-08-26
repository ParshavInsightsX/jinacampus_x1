"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronUp, LayoutGrid, MapPin, X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";

import type { AppShellBranding } from "./branding";
import type { NavbarSessionContext } from "./navbar-types";

type MobileContextSheetProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  onOpenChange: (isOpen: boolean) => void;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function useDialogFocus(
  isOpen: boolean,
  sheetRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
  close: () => void
) {
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
        close();
        triggerRef.current?.focus();
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
  }, [close, isOpen, sheetRef, triggerRef]);
}

export function MobileContextSheet({ context, branding, onOpenChange }: MobileContextSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);
  const branchLabel = branding.branchName
    ? `${branding.branchName}${branding.branchCode ? ` (${branding.branchCode})` : ""}`
    : context.hasActiveBranch
      ? "Selected branch"
      : "Branch not selected";
  const academicYearLabel =
    branding.academicYearName ?? (context.hasActiveAcademicYear ? "Active academic year" : "Academic year not active");
  const compactLabel = `${branding.branchName ?? branchLabel} · ${academicYearLabel}`;

  const updateOpen = useCallback((nextOpen: boolean) => {
    setIsOpen(nextOpen);
    onOpenChange(nextOpen);
  }, [onOpenChange]);
  const close = useCallback(() => updateOpen(false), [updateOpen]);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useDialogFocus(isOpen, sheetRef, triggerRef, close);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="mt-0.5 flex min-h-6 max-w-full items-center gap-1 rounded-md pr-1 text-left text-[10px] font-semibold text-slate-500 transition hover:text-brand-700 premium-focus"
        aria-label="Open school context"
        aria-expanded={isOpen}
        aria-controls="mobile-school-context-sheet"
        onClick={() => updateOpen(true)}
      >
        <span className="truncate">{compactLabel}</span>
        <ChevronUp className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-end bg-ink/45 px-2 pt-16 lg:hidden"
              data-mobile-context-overlay="true"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) updateOpen(false);
              }}
            >
              <section
                ref={sheetRef}
                id="mobile-school-context-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-school-context-title"
                className="mobile-sheet-surface mx-auto max-h-[min(34rem,calc(100dvh-4rem))] w-full max-w-lg overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
                <div className="flex items-center justify-between gap-3 border-b border-campus-border pb-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-brand-700">Current workspace</p>
                    <h2 id="mobile-school-context-title" className="truncate text-base font-semibold text-ink">
                      {branding.institutionName}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateOpen(false)}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink premium-focus"
                    aria-label="Close school context"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <dl className="mt-3 divide-y divide-campus-border rounded-lg border border-campus-border bg-white">
                  <div className="flex gap-3 p-3">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">Institution</dt>
                      <dd className="break-words text-sm font-semibold text-ink">{branding.institutionName}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-campus-teal" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">Branch</dt>
                      <dd className="break-words text-sm font-semibold text-ink">{branchLabel}</dd>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-campus-gold" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs text-slate-500">Academic year</dt>
                      <dd className="break-words text-sm font-semibold text-ink">{academicYearLabel}</dd>
                    </div>
                  </div>
                </dl>

                <Link
                  href="/account/workspaces"
                  onClick={() => updateOpen(false)}
                  className="premium-secondary-button mt-3 w-full gap-2 premium-focus"
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  Review workspace access
                </Link>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
