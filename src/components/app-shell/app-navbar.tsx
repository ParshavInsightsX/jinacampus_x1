"use client";

import type { FocusEvent } from "react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { getNavbarRouteContext, isNavbarAutoHideEnabled } from "@/config/navbar";
import { useAutoHideNavbar } from "@/hooks/use-auto-hide-navbar";
import { BrandLogo } from "@/components/brand/brand-logo";
import { InstitutionLogo } from "@/components/brand/institution-logo";
import { PwaInstallProvider } from "@/components/pwa/pwa-install-control";
import { NotificationBell } from "./notification-bell";

import type { AppShellBranding } from "./branding";
import { InstitutionBrand } from "./institution-brand";
import { MobileNavigationDrawer } from "./mobile-navigation-drawer";
import { MobileNavigationTrigger } from "./mobile-navigation-trigger";
import { NavbarContextMenu } from "./navbar-context-menu";
import { NavbarPageContext } from "./navbar-page-context";
import type { NavbarSessionContext } from "./navbar-types";
import { NavbarUserMenu } from "./navbar-user-menu";
import type { NavGroup } from "./navigation";
import { TopEdgeRevealZone } from "./top-edge-reveal-zone";

type AppNavbarProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  navigationGroups: readonly NavGroup[];
  mobileNavigationOpen: boolean;
  onMobileNavigationOpenChange: (isOpen: boolean) => void;
  notificationsEnabled: boolean;
  forceVisible?: boolean;
};

function focusRemainsWithin(event: FocusEvent<HTMLElement>) {
  return event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

export function AppNavbar({
  context,
  branding,
  navigationGroups,
  mobileNavigationOpen,
  onMobileNavigationOpenChange,
  notificationsEnabled,
  forceVisible = false
}: AppNavbarProps) {
  const pathname = usePathname();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
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
    <PwaInstallProvider>
      <TopEdgeRevealZone onReveal={reveal} />
      <header
        className={`sticky top-0 z-50 min-w-0 border-b border-campus-border bg-white pt-[env(safe-area-inset-top)] shadow-[0_6px_18px_rgba(11,22,56,0.07)] transition-transform duration-200 ease-out motion-reduce:transition-none lg:border-white/70 lg:bg-white/70 lg:pt-0 lg:shadow-[0_10px_36px_rgba(11,22,56,0.08)] lg:backdrop-blur-2xl ${isVisible ? "translate-y-0" : "-translate-y-full"}`}
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
            className="flex shrink-0 items-center gap-1.5 rounded-[1.65rem] border border-white/90 bg-white/65 p-1.5 shadow-[0_16px_42px_rgba(11,22,56,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl"
            aria-label="Workspace and account controls"
            data-desktop-command-cluster="true"
          >
            {notificationsEnabled ? <NotificationBell onOpenChange={setNotificationMenuOpen} /> : null}
            <NavbarContextMenu context={context} branding={branding} onOpenChange={setContextMenuOpen} />
            <NavbarUserMenu context={context} branding={branding} onOpenChange={setAccountMenuOpen} />
          </div>
        </div>

        <div className="flex min-h-16 min-w-0 items-center gap-2.5 px-3 lg:hidden">
          <MobileNavigationTrigger
            ref={mobileTriggerRef}
            isOpen={mobileNavigationOpen}
            onClick={() => onMobileNavigationOpenChange(!mobileNavigationOpen)}
          />
          <InstitutionLogo
            name={branding.institutionName}
            logoUrl={branding.logoUrl}
            className="h-8 w-8"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-bold text-brand-800" title={branding.institutionName}>
              {branding.institutionName}
            </p>
            <NavbarPageContext routeContext={routeContext} variant="mobile" />
          </div>
          {notificationsEnabled ? <NotificationBell compact onOpenChange={setNotificationMenuOpen} /> : null}
          <NavbarUserMenu compact context={context} branding={branding} onOpenChange={setAccountMenuOpen} />
        </div>
      </header>

      <MobileNavigationDrawer
        isOpen={mobileNavigationOpen}
        onOpenChange={onMobileNavigationOpenChange}
        groups={navigationGroups}
        context={context}
        branding={branding}
        returnFocusRef={mobileTriggerRef}
      />
    </PwaInstallProvider>
  );
}
