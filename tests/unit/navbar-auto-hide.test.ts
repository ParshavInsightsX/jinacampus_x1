import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getNavbarRouteContext, isNavbarAutoHideEnabled, NAVBAR_AUTO_HIDE_CONFIG } from "@/config/navbar";
import {
  createAutoHideNavbarTelemetry,
  getAutoHideNavbarTransition,
  INITIAL_AUTO_HIDE_NAVBAR_STATE,
  type AutoHideNavbarState
} from "@/hooks/use-auto-hide-navbar";
import { getVisibleNavigationGroups } from "@/components/app-shell/navigation";
import type { PermissionCode } from "@/lib/rbac/permissions";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function transition(
  state: AutoHideNavbarState,
  fromY: number,
  toY: number,
  overrides: Partial<Parameters<typeof getAutoHideNavbarTransition>[2]> = {}
) {
  return getAutoHideNavbarTransition(state, createAutoHideNavbarTelemetry(fromY), {
    currentScrollY: toY,
    viewportHeight: 800,
    documentHeight: 2400,
    enabled: true,
    locked: false,
    topThreshold: NAVBAR_AUTO_HIDE_CONFIG.topThreshold,
    hideThreshold: NAVBAR_AUTO_HIDE_CONFIG.hideThreshold,
    directionDelta: NAVBAR_AUTO_HIDE_CONFIG.directionDelta,
    ...overrides
  });
}

describe("intelligent auto-hide navbar", () => {
  it("starts visible and stays visible near the top", () => {
    expect(INITIAL_AUTO_HIDE_NAVBAR_STATE).toEqual({
      isVisible: true,
      isNearTop: true,
      scrollDirection: "idle"
    });

    const result = transition(
      { isVisible: false, isNearTop: false, scrollDirection: "down" },
      120,
      32
    );
    expect(result.state).toEqual({ isVisible: true, isNearTop: true, scrollDirection: "idle" });
  });

  it("hides after meaningful downward travel beyond the threshold", () => {
    const result = transition(INITIAL_AUTO_HIDE_NAVBAR_STATE, 90, 104);
    expect(result.state).toEqual({ isVisible: false, isNearTop: false, scrollDirection: "down" });
  });

  it("reappears after meaningful upward travel", () => {
    const result = transition(
      { isVisible: false, isNearTop: false, scrollDirection: "down" },
      140,
      128
    );
    expect(result.state).toEqual({ isVisible: true, isNearTop: false, scrollDirection: "up" });
  });

  it("ignores tiny directional changes to prevent flicker", () => {
    const result = transition(INITIAL_AUTO_HIDE_NAVBAR_STATE, 90, 95);
    expect(result.state.isVisible).toBe(true);
    expect(result.state.scrollDirection).toBe("idle");
  });

  it("stays visible while interaction is locked or the page cannot scroll", () => {
    expect(transition({ isVisible: false, isNearTop: false, scrollDirection: "down" }, 90, 120, { locked: true }).state.isVisible).toBe(true);
    expect(transition({ isVisible: false, isNearTop: false, scrollDirection: "down" }, 90, 120, { viewportHeight: 900, documentHeight: 900 }).state.isVisible).toBe(true);
  });

  it("keeps focused attendance-entry and scanner routes visible by configuration", () => {
    expect(isNavbarAutoHideEnabled("/dashboard")).toBe(true);
    expect(isNavbarAutoHideEnabled("/academia/attendance/mark")).toBe(false);
    expect(isNavbarAutoHideEnabled("/staffboard/attendance/scan")).toBe(false);
    expect(getNavbarRouteContext("/academia/students/student-id/edit")).toEqual({
      title: "Edit student",
      section: "Academia",
      parentHref: "/academia/students",
      parentLabel: "Students"
    });
  });

  it("provides specific context for identity-card, leave, and self-attendance routes", () => {
    expect(getNavbarRouteContext("/academia/students/student-id/id-card")).toEqual({
      title: "Student ID card",
      section: "Academia",
      parentHref: "/academia/students",
      parentLabel: "Students"
    });
    expect(getNavbarRouteContext("/campus-core/institutions/institution-id/legal-identity")).toEqual({
      title: "Institution legal identity",
      section: "CampusCore",
      parentHref: "/campus-core/institutions",
      parentLabel: "School profile"
    });
    expect(getNavbarRouteContext("/staffboard/attendance/card").title).toBe("My Attendance QR");
    expect(getNavbarRouteContext("/staffboard/attendance/qr").title).toBe("Staff QR cards");
    expect(getNavbarRouteContext("/staffboard/leave/apply").title).toBe("Apply for leave");
    expect(getNavbarRouteContext("/staffboard/leave/application-id/edit").title).toBe(
      "Edit leave application"
    );
    expect(getNavbarRouteContext("/account/workspaces").title).toBe("Choose a workspace");
  });

  it("locks visibility for menus, focus, pointer interaction, and mobile navigation", () => {
    const navbar = source("src/components/app-shell/app-navbar.tsx");
    const revealZone = source("src/components/app-shell/top-edge-reveal-zone.tsx");

    expect(navbar).toContain("mobileNavigationOpen || accountMenuOpen || contextMenuOpen || notificationMenuOpen || focusWithin || pointerWithin");
    expect(navbar).toContain("onFocusCapture");
    expect(navbar).toContain("onPointerEnter");
    expect(revealZone).toContain("data-navbar-reveal-zone");
  });

  it("uses one passive scroll listener, requestAnimationFrame containment, and complete cleanup", () => {
    const hook = source("src/hooks/use-auto-hide-navbar.ts");

    expect(hook).toContain('window.addEventListener("scroll", onScroll, { passive: true })');
    expect(hook).toContain("window.requestAnimationFrame(evaluateScroll)");
    expect(hook).toContain('window.removeEventListener("scroll", onScroll)');
    expect(hook).toContain("window.cancelAnimationFrame(frameRef.current)");
    expect(hook).toContain("usePathname");
    expect(hook).toContain('window.addEventListener("pageshow"');
    expect(hook).toContain('window.addEventListener("popstate"');
  });

  it("keeps a stable sticky layout row and reduced-motion behavior", () => {
    const navbar = source("src/components/app-shell/app-navbar.tsx");
    const styles = source("src/app/globals.css");

    expect(navbar).toContain('data-navbar-layout="stable-sticky-row"');
    expect(navbar).toContain("sticky top-0");
    expect(navbar).toContain("translate-y-0");
    expect(navbar).toContain("-translate-y-full");
    expect(navbar).toContain("motion-reduce:transition-none");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses an accessible focus-trapped module sheet and restores focus", () => {
    const moduleSheet = source("src/components/app-shell/mobile-module-sheet.tsx");
    const bottomNavigation = source("src/components/app-shell/mobile-bottom-nav.tsx");

    expect(moduleSheet).toContain('role="dialog"');
    expect(moduleSheet).toContain('aria-modal="true"');
    expect(moduleSheet).toContain('event.key === "Escape"');
    expect(moduleSheet).toContain('event.key !== "Tab"');
    expect(moduleSheet).toContain('document.body.style.overflow = "hidden"');
    expect(moduleSheet).toContain("returnFocusRef.current?.focus()");
    expect(bottomNavigation).toContain("onOpenNavigation");
    expect(bottomNavigation).toContain('aria-controls="mobile-module-sheet"');
  });

  it("serializes only already-filtered navigation labels and URLs into client chrome", () => {
    const groups = getVisibleNavigationGroups(new Set<PermissionCode>(["campuscore.tenant.view"]));
    const serialized = JSON.stringify(groups);
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(serialized).toContain("Dashboard");
    expect(serialized).not.toMatch(/permissions|tenantId|branchId|userId/);
    expect(layout).toContain("getVisibleNavigationGroups(permissions, navigationFeatures)");
    expect(layout).toContain("getMobileBottomNavigationItems(");
    expect(layout).toContain("const navigationFeatures = { gradebookEnabled, attendance }");
    expect(layout).not.toMatch(/<AppChrome[\s\S]{0,240}permissions=/);
  });

  it("preserves secure logout and server route protection", () => {
    const logout = source("src/app/api/auth/logout/route.ts");
    const proxy = source("proxy.ts");

    expect(logout).toContain('NextResponse.redirect(new URL("/", request.url)');
    expect(logout).toContain("response.cookies.delete");
    expect(proxy).toContain("protectedPrefixes");
    expect(proxy).toContain('new URL("/", request.url)');
  });
});
