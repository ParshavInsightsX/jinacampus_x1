"use client";

import { useRef, useState } from "react";

import { PwaInstallProvider } from "@/components/pwa/pwa-install-control";
import type { AppShellBranding } from "./branding";
import { AppNavbar } from "./app-navbar";
import { ConnectivityBanner } from "./connectivity-banner";
import { DesktopNavigationDock } from "./desktop-navigation-dock";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MobileModuleSheet } from "./mobile-module-sheet";
import type { NavbarSessionContext } from "./navbar-types";
import type { MobileBottomNavItem, NavGroup } from "./navigation";

type AppChromeProps = {
  context: NavbarSessionContext;
  branding: AppShellBranding;
  navigationGroups: readonly NavGroup[];
  mobileBottomItems: readonly MobileBottomNavItem[];
  notificationsEnabled: boolean;
};

export function AppChrome({
  context,
  branding,
  navigationGroups,
  mobileBottomItems,
  notificationsEnabled
}: AppChromeProps) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <PwaInstallProvider>
      <AppNavbar
        context={context}
        branding={branding}
        mobileNavigationOpen={mobileNavigationOpen}
        notificationsEnabled={notificationsEnabled}
      />
      <ConnectivityBanner />
      <DesktopNavigationDock groups={navigationGroups} />
      <MobileBottomNav
        groups={navigationGroups}
        items={mobileBottomItems}
        moreButtonRef={mobileMoreButtonRef}
        onOpenNavigation={() => setMobileNavigationOpen(true)}
      />
      <MobileModuleSheet
        isOpen={mobileNavigationOpen}
        onOpenChange={setMobileNavigationOpen}
        groups={navigationGroups}
        context={context}
        branding={branding}
        returnFocusRef={mobileMoreButtonRef}
      />
    </PwaInstallProvider>
  );
}
