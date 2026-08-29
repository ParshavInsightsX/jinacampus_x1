"use client";

import { LayoutGrid, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NavigationIcon } from "./navigation-icon";
import {
  getActiveNavHref,
  getDesktopDockNavigationItems,
  isNavItemActive,
  type DesktopDockNavItem,
  type NavGroup
} from "./navigation";

type DesktopNavigationDockProps = {
  groups: readonly NavGroup[];
};

const dockIconToneByModule: Record<DesktopDockNavItem["moduleKey"], string> = {
  dashboard: "bg-brand-50 text-brand-700",
  "campus-core": "bg-white text-ink",
  academia: "bg-sky-50 text-sky-700",
  gradebook: "bg-violet-50 text-violet-700",
  staffboard: "bg-emerald-50 text-emerald-700"
};

function isDockItemActive(item: DesktopDockNavItem, pathname: string, activeHref: string | null) {
  if (activeHref && item.activeHrefs.includes(activeHref)) return true;
  return item.activeHrefs.some((href) => isNavItemActive({ href }, pathname, activeHref));
}

function dockIconClass(item: DesktopDockNavItem, isActive: boolean) {
  if (isActive) {
    return "border-brand-500 bg-brand-500 text-white shadow-[0_10px_24px_rgba(36,87,230,0.32)]";
  }

  return `border-white/90 shadow-[0_7px_18px_rgba(11,22,56,0.12)] ${dockIconToneByModule[item.moduleKey]}`;
}

export function DesktopNavigationDock({ groups }: DesktopNavigationDockProps) {
  const pathname = usePathname() ?? "/dashboard";
  const activeHref = getActiveNavHref(groups, pathname);
  const dockItems = getDesktopDockNavigationItems(groups);
  const [launcherPathname, setLauncherPathname] = useState<string | null>(null);
  const dockRootRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLElement>(null);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const launcherOpen = launcherPathname === pathname;

  useEffect(() => {
    if (!launcherOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      launcherRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !dockRootRef.current?.contains(event.target)) {
        setLauncherPathname(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setLauncherPathname(null);
      launcherButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [launcherOpen]);

  if (dockItems.length === 0) return null;

  return (
    <div
      className="desktop-dock-shell pointer-events-none fixed bottom-5 left-0 right-0 z-[60] hidden justify-center px-4 lg:flex"
      data-desktop-navigation-dock="true"
    >
      <div ref={dockRootRef} className="pointer-events-auto relative max-w-[calc(100vw-2rem)]">
        {launcherOpen ? (
          <section
            ref={launcherRef}
            id="desktop-application-launcher"
            role="dialog"
            aria-label="All application modules"
            className="jc-glass-elevated absolute bottom-[calc(100%+1rem)] left-1/2 max-h-[min(36rem,calc(100vh-9rem))] w-[min(44rem,calc(100vw-3rem))] -translate-x-1/2 overflow-hidden rounded-[1.5rem] border"
            data-desktop-module-launcher="true"
          >
            <div className="flex min-h-16 items-center justify-between gap-3 border-b border-campus-border/80 px-5">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink">All permitted areas</h2>
                <p className="text-xs text-slate-500">Open a specific JinaCampus workspace</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLauncherPathname(null);
                  launcherButtonRef.current?.focus();
                }}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-ink premium-focus"
                aria-label="Close all modules"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="premium-nav-scroll max-h-[min(30rem,calc(100vh-14rem))] overflow-y-auto p-5">
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {groups.map((group) => (
                  <section key={group.title} aria-labelledby={`desktop-dock-${group.title.replace(/\s+/g, "-").toLowerCase()}`}>
                    <h3
                      id={`desktop-dock-${group.title.replace(/\s+/g, "-").toLowerCase()}`}
                      className="text-xs font-semibold text-slate-500"
                    >
                      {group.title}
                    </h3>
                    <div className="mt-2 space-y-1">
                      {group.items.map((item) => {
                        const isActive = isNavItemActive(item, pathname, activeHref);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition premium-focus ${
                              isActive
                                ? "bg-brand-50 text-brand-700"
                                : "text-slate-700 hover:bg-slate-100 hover:text-ink"
                            }`}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-campus-border bg-white text-brand-700">
                              <NavigationIcon href={item.href} />
                            </span>
                            <span className="min-w-0 truncate">{item.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <nav
          aria-label="Desktop primary navigation"
          className="desktop-dock-surface jc-glass-application w-fit max-w-full rounded-[1.75rem] border px-3 py-2.5"
          data-dock-launcher-open={launcherOpen}
        >
          <ul className="desktop-dock-list m-0 flex min-h-[4.75rem] list-none items-end justify-center gap-1 p-0">
            {dockItems.map((item) => {
              const isActive = isDockItemActive(item, pathname, activeHref);
              return (
                <li
                  key={item.moduleKey}
                  className="desktop-dock-item relative flex w-[clamp(6rem,7.5vw,7.25rem)] items-end justify-center"
                  data-dock-module={item.moduleKey}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className="desktop-dock-button relative flex min-h-[4.75rem] w-full flex-col items-center justify-end gap-1 rounded-[1.15rem] px-2 pb-1 pt-1 text-center text-ink premium-focus"
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.95rem] border ${dockIconClass(item, isActive)}`}>
                      <NavigationIcon href={item.iconHref} className="h-6 w-6" />
                    </span>
                    <span className={`block max-w-full whitespace-nowrap text-[11px] font-semibold leading-4 ${isActive ? "text-brand-700" : "text-slate-700"}`}>
                      {item.title}
                    </span>
                    {isActive ? (
                      <span className="absolute -bottom-1 h-1 w-5 rounded-full bg-brand-500" aria-hidden="true" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
            <li className="desktop-dock-item relative flex w-[clamp(6rem,7.5vw,7.25rem)] items-end justify-center" data-dock-module="launcher">
              <button
                ref={launcherButtonRef}
                type="button"
                aria-label="Open all permitted areas"
                aria-haspopup="dialog"
                aria-expanded={launcherOpen}
                aria-controls="desktop-application-launcher"
                onClick={() => setLauncherPathname((current) => current === pathname ? null : pathname)}
                className="desktop-dock-button relative flex min-h-[4.75rem] w-full flex-col items-center justify-end gap-1 rounded-[1.15rem] px-2 pb-1 pt-1 text-center text-ink premium-focus"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[0.95rem] border border-slate-700 bg-sidebar text-white shadow-[0_8px_20px_rgba(3,15,46,0.28)]">
                  <LayoutGrid className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="block max-w-full whitespace-nowrap text-[11px] font-semibold leading-4 text-slate-700">All areas</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
