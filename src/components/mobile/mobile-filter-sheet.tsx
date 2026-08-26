"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

type MobileFilterSheetProps = {
  title: string;
  activeCount?: number;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function MobileFilterSheet({ title, activeCount = 0, children }: MobileFilterSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) triggerRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

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
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      if (focusable.length === 0) return;
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
  }, [isOpen]);

  return (
    <div data-mobile-filter-sheet="true">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className="premium-secondary-button w-full gap-2 md:hidden"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="mobile-filter-sheet"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filters
        {activeCount > 0 ? (
          <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
            {activeCount}
          </span>
        ) : null}
      </button>

      <div
        className={isOpen
          ? "fixed inset-0 z-[80] flex items-end bg-ink/45 px-2 pt-12 md:static md:block md:bg-transparent md:p-0"
          : "hidden md:block"}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}
      >
        <section
          ref={sheetRef}
          id="mobile-filter-sheet"
          role={isOpen ? "dialog" : undefined}
          aria-modal={isOpen ? "true" : undefined}
          aria-labelledby={isOpen ? "mobile-filter-sheet-title" : undefined}
          className="mobile-sheet-surface mx-auto max-h-[min(42rem,calc(100dvh-3rem))] w-full max-w-xl overflow-y-auto px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:contents"
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-campus-border pb-3 md:hidden">
            <div>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
              <h2 id="mobile-filter-sheet-title" className="text-base font-semibold text-ink">{title}</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink premium-focus"
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </section>
      </div>
    </div>
  );
}
