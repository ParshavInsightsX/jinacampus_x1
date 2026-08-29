"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  getActiveNavHref,
  isNavItemActive,
  type MobileBottomNavItem,
  type NavGroup
} from "./navigation";
import { NavigationIcon } from "./navigation-icon";

type MobileBottomNavProps = {
  groups: readonly NavGroup[];
  items: readonly MobileBottomNavItem[];
  moreButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenNavigation: () => void;
};

const TEXT_ENTRY_SELECTOR = [
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit'])",
  "textarea",
  "select",
  "[contenteditable='true']"
].join(",");

export function MobileBottomNav({ groups, items, moreButtonRef, onOpenNavigation }: MobileBottomNavProps) {
  const pathname = usePathname();
  const activeHref = getActiveNavHref(groups, pathname);
  const gridColumns = `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`;
  const [compact, setCompact] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const lastScrollYRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollYRef.current;
        if (currentY < 48) setCompact(false);
        else if (delta > 8) setCompact(true);
        else if (delta < -8) setCompact(false);
        lastScrollYRef.current = currentY;
        frameRef.current = null;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const update = () => setFieldFocused(document.activeElement instanceof Element && document.activeElement.matches(TEXT_ENTRY_SELECTOR));
    const onFocusOut = () => window.requestAnimationFrame(update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <nav
      className={`jc-motion-shell pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden ${fieldFocused ? "translate-y-[calc(100%+env(safe-area-inset-bottom))]" : "translate-y-0"}`}
      aria-label="Mobile primary navigation"
      data-mobile-navigation="true"
      data-mobile-dock="true"
      data-mobile-dock-compact={compact}
      data-mobile-dock-field-focused={fieldFocused}
    >
      <div className={`mobile-dock-surface pointer-events-auto mx-auto max-w-[28rem] ${compact ? "p-1" : "p-1.5"}`}>
        <div className="grid gap-1" style={{ gridTemplateColumns: gridColumns }}>
          {items.map((item) => {
            const isActive = item.kind === "more" ? false : isNavItemActive(item, pathname, activeHref);
            const itemClassName = `jc-motion-interactive group flex min-w-0 flex-col items-center justify-center rounded-[1.15rem] px-1 font-semibold active:scale-[0.98] premium-focus ${
              compact ? "min-h-12 gap-0.5" : "min-h-14 gap-1"
            } ${
              isActive
                ? "bg-white text-brand-800 shadow-[0_7px_18px_rgba(36,87,230,0.18)]"
                : "text-slate-600 hover:bg-white/70 hover:text-ink"
            }`;

            if (item.kind === "more") {
              return (
                <button
                  ref={moreButtonRef}
                  key={item.title}
                  type="button"
                  className={itemClassName}
                  aria-label="Open all application navigation"
                  aria-haspopup="dialog"
                  aria-controls="mobile-module-sheet"
                  onClick={onOpenNavigation}
                >
                  <Menu className={`${compact ? "h-5 w-5" : "h-5.5 w-5.5"}`} aria-hidden="true" />
                  <span className={`${compact ? "text-[9px] leading-3 opacity-80" : "text-[10px] leading-3"}`}>{item.title}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={itemClassName}
              >
                <span className={`jc-motion-interactive ${isActive ? "-translate-y-0.5 scale-105" : "group-active:scale-95"}`}>
                  <NavigationIcon href={item.href} className={compact ? "h-5 w-5" : "h-5.5 w-5.5"} />
                </span>
                <span className={`max-w-full truncate text-center ${compact ? "text-[9px] leading-3 opacity-80" : "text-[10px] leading-3"}`}>
                  {item.title}
                </span>
                {isActive ? <span className="h-0.5 w-4 rounded-full bg-brand-600" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
