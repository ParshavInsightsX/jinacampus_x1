import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getDesktopDockNavigationItems,
  getVisibleNavigationGroups
} from "@/components/app-shell/navigation";
import type { PermissionCode } from "@/lib/rbac/permissions";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("desktop navigation dock", () => {
  it("replaces the rendered desktop sidebar with a content-safe bottom dock", () => {
    const dock = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const chrome = source("src/components/app-shell/app-chrome.tsx");
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(chrome).toContain("DesktopNavigationDock");
    expect(chrome).toContain("groups={navigationGroups}");
    expect(dock).toContain('data-desktop-navigation-dock="true"');
    expect(dock).toContain('aria-label="Desktop primary navigation"');
    expect(dock).toContain("fixed bottom-5");
    expect(dock).toContain("left-0 right-0");
    expect(dock).toContain("hidden justify-center");
    expect(dock).toContain("lg:flex");
    expect(layout).toContain("lg:pb-40");
    expect(layout).not.toContain("DesktopShell");
    expect(layout).toContain('max-w-[100rem]');
  });

  it("provides persistent labels, active state, a complete launcher, and keyboard dismissal", () => {
    const dock = source("src/components/app-shell/desktop-navigation-dock.tsx");

    expect(dock).toContain('aria-current={isActive ? "page" : undefined}');
    expect(dock).toContain("{item.title}");
    expect(dock).toContain("All areas");
    expect(dock).toContain('aria-haspopup="dialog"');
    expect(dock).toContain('role="dialog"');
    expect(dock).toContain('event.key !== "Escape"');
    expect(dock).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(dock).toContain('querySelector<HTMLAnchorElement>("a[href]")?.focus()');
    expect(dock).toContain("launcherButtonRef.current?.focus()");
  });

  it("implements macOS-style direct and adjacent magnification with reduced-motion support", () => {
    const styles = source("src/app/globals.css");

    expect(styles).toContain(".desktop-dock-item:hover");
    expect(styles).toContain(".desktop-dock-item:focus-within");
    expect(styles).toContain(".desktop-dock-item:has(+ .desktop-dock-item:hover)");
    expect(styles).toContain("translateY(-0.55rem) scale(1.18)");
    expect(styles).toContain("translateY(-0.25rem) scale(1.08)");
    expect(styles).toContain('[data-dock-launcher-open="true"] .desktop-dock-item');
    expect(styles).not.toContain('[data-sidebar-state="collapsed"] + div .desktop-dock-shell');
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("auto-sizes from the already-filtered module groups", () => {
    const permissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "campuscore.user.view",
      "academia.student.view",
      "staffboard.staff.view"
    ]);
    const items = getDesktopDockNavigationItems(getVisibleNavigationGroups(permissions));

    expect(items.map((item) => item.title)).toEqual(["Dashboard", "CampusCore", "Academia", "StaffBoard"]);
    expect(items.map((item) => item.href)).toEqual([
      "/dashboard",
      "/campus-core/users",
      "/academia",
      "/staffboard"
    ]);
    expect(items.every((item) => item.activeHrefs.length > 0)).toBe(true);
  });

  it("keeps dock payloads display-safe and leaves authorization on the server", () => {
    const dock = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const layout = source("src/app/(dashboard)/layout.tsx");

    expect(layout).toContain("getVisibleNavigationGroups(permissions, navigationFeatures)");
    expect(layout).toContain("getMobileBottomNavigationItems(");
    expect(layout).toContain("const navigationFeatures = { gradebookEnabled, attendance }");
    expect(dock).not.toMatch(/tenantId|branchId|academicYearId|userId|permissionCodes|roleCodes/);
    expect(dock).not.toMatch(/passwordHash|tokenHash|rawToken/);
  });
});
