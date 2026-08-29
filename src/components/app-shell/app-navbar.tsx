"use client";

import type { FocusEvent } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { BrandLogo } from "@/components/brand/brand-logo";
import { InstitutionLogo } from "@/components/brand/institution-logo";
import { getNavbarRouteContext, isNavbarAutoHideEnabled } from "@/config/navbar";
import { useAutoHideNavbar } from "@/hooks/use-auto-hide-navbar";
import type { AppShellBranding } from "./branding";
import { InstitutionBrand } from "./institution-brand";
import { MobileContextSheet } from "./mobile-context-sheet";
import { NavbarContextMenu } from "./navbar-context-menu";
import { NavbarPageContext } from "./navbar-page-context";
import type { NavbarSessionContext } from "./navbar-types";
import { NavbarUserMenu } from "./navbar-user-menu";
import { NotificationBell } from "./notification-bell";
import { TopEdgeRevealZone } from "./top-edge-reveal-zone";

type AppNavbarProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  mobileNavigationOpen: boolean;
  notificationsEnabled: boolean;
  forceVisible?: boolean;
};

function focusRemainsWithin(event: FocusEvent<HTMLElement>) {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

export function AppNavbar({
  context,
  branding,
  mobileNavigationOpen,
  notificationsEnabled,
  forceVisible = false
}: AppNavbarProps) {
  const pathname = usePathname();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pointerWithin, setPointerWithin] = useState(false);
  const routeContext = getNavbarRouteContext(pathname);
  const autoHideEnabled = isNavbarAutoHideEnabled(pathname);
  const visibilityLocked =
    forceVisible || mobileNavigationOpen || accountMenuOpen || contextMenuOpen || notificationMenuOpen || focusWithin || pointerWithin;
  const { isVisible, isNearTop, scrollDirection, reveal } = useAutoHideNavbar({
    enabled: autoHideEnabled,
    locked: visibilityLocked
  });

  return (
    <>
      <TopEdgeRevealZone onReveal={reveal} />
      <header
        className={`jc-glass-application jc-motion-shell sticky top-0 z-50 min-w-0 border-b pt-[env(safe-area-inset-top)] motion-reduce:transition-none lg:pt-0 ${isVisible ? "translate-y-0" : "-translate-y-full"}`}
        data-app-navbar="true"
        data-navbar-layout="stable-sticky-row"
        data-navbar-visible={isVisible}
        data-navbar-near-top={isNearTop}
        data-navbar-scroll-direction={scrollDirection}
        data-navbar-auto-hide-enabled={autoHideEnabled}
        onFocusCapture={() => {
          setFocusWithin(true);
          reveal();
        }}
        onBlurCapture={(event) => {
          if (!focusRemainsWithin(event)) setFocusWithin(false);
        }}
        onPointerEnter={() => {
          setPointerWithin(true);
          reveal();
        }}
        onPointerLeave={() => setPointerWithin(false)}
      >
        <div className="mx-auto hidden min-h-[5.5rem] w-full max-w-[100rem] min-w-0 items-center justify-between gap-5 px-7 lg:flex xl:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-5">
            <BrandLogo className="w-36 shrink-0 xl:w-44" priority />
            <InstitutionBrand branding={branding} className="max-w-[10rem] xl:max-w-[14rem]" />
            <span className="h-10 w-px shrink-0 bg-campus-border" aria-hidden="true" />
            <div className="min-w-0">
              <NavbarPageContext routeContext={routeContext} variant="desktop" />
            </div>
          </div>
          <div
            className="jc-glass-elevated flex shrink-0 items-center gap-1.5 rounded-[1.65rem] border p-1.5"
            aria-label="Workspace and account controls"
            data-desktop-command-cluster="true"
          >
            {notificationsEnabled ? <NotificationBell onOpenChange={setNotificationMenuOpen} /> : null}
            <NavbarContextMenu context={context} branding={branding} onOpenChange={setContextMenuOpen} />
            <NavbarUserMenu context={context} branding={branding} onOpenChange={setAccountMenuOpen} />
          </div>
        </div>

        <div className="flex min-h-[4.25rem] min-w-0 items-center gap-2 px-3 lg:hidden">
          {!routeContext.parentHref ? (
            <InstitutionLogo name={branding.institutionName} logoUrl={branding.logoUrl} className="h-9 w-9" />
          ) : null}
          <div className="min-w-0 flex-1">
            <NavbarPageContext
              routeContext={routeContext}
              variant="mobile"
              supporting={(
                <MobileContextSheet
                  context={context}
                  branding={branding}
                  onOpenChange={setContextMenuOpen}
                />
              )}
            />
          </div>
          {notificationsEnabled ? <NotificationBell compact onOpenChange={setNotificationMenuOpen} /> : null}
          <NavbarUserMenu compact context={context} branding={branding} onOpenChange={setAccountMenuOpen} />
        </div>
      </header>
    </>
  );
}
