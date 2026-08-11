import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { PermissionCode } from "@/lib/rbac/permissions";
import {
  getMobileBottomNavigationItems,
  getNavigationAudience
} from "@/components/app-shell/navigation";
import { canViewDashboardSection } from "@/modules/dashboard/components/dashboard-state";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("mobile web/PWA UI redesign", () => {
  it("keeps mobile chrome separate from the desktop-only bottom dock", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const appChrome = source("src/components/app-shell/app-chrome.tsx");
    const appNavbar = source("src/components/app-shell/app-navbar.tsx");
    const desktopDock = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const mobileDrawer = source("src/components/app-shell/mobile-navigation-drawer.tsx");
    const mobileBottomNav = source("src/components/app-shell/mobile-bottom-nav.tsx");

    expect(layout).not.toContain("DesktopShell");
    expect(layout).toContain("AppChrome");
    expect(appChrome).toContain("AppNavbar");
    expect(appChrome).toContain("DesktopNavigationDock");
    expect(appNavbar).toContain('data-app-navbar="true"');
    expect(desktopDock).toContain("hidden justify-center");
    expect(desktopDock).toContain("lg:flex");
    expect(mobileDrawer).toContain('data-mobile-navigation-drawer="true"');
    expect(mobileBottomNav).toContain('data-mobile-navigation="true"');
    expect(mobileBottomNav).toContain("pb-[env(safe-area-inset-bottom)]");
  });

  it("keeps mobile bottom navigation role and permission aware", () => {
    const adminPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "campuscore.user.view",
      "academia.attendance.view",
      "staffboard.attendance.report",
    ]);
    const teacherPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.attendance.view",
      "academia.attendance.mark",
      "academia.attendance.report",
      "academia.student.view",
    ]);
    const staffPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.self_scan",
      "staffboard.attendance.self_view",
    ]);
    const officePermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.staff.view",
      "staffboard.attendance.view",
      "staffboard.attendance.report",
      "staffboard.attendance.self_scan",
      "staffboard.attendance.self_view",
    ]);

    expect(getMobileBottomNavigationItems(adminPermissions).map((item) => item.title)).toEqual([
      "Home",
      "Attendance",
      "Users",
      "Reports",
      "More",
    ]);
    expect(getMobileBottomNavigationItems(teacherPermissions).map((item) => item.title)).toEqual([
      "Home",
      "My Class",
      "Attendance",
      "Students",
      "More",
    ]);
    expect(getMobileBottomNavigationItems(staffPermissions).map((item) => item.title)).toEqual([
      "Home",
      "Scan QR",
      "My Attendance",
      "Profile",
      "More",
    ]);
    expect(getNavigationAudience(officePermissions, ["OFFICE_STAFF"])).toBe("office");
    expect(getMobileBottomNavigationItems(officePermissions, ["OFFICE_STAFF"]).map((item) => item.title)).toEqual([
      "Home",
      "Attendance",
      "Scan QR",
      "My Attendance",
      "More",
    ]);
  });

  it("keeps self-only staff permissions out of branch-wide attendance metrics", () => {
    const selfOnlyPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.self_scan",
      "staffboard.attendance.self_view",
    ]);

    expect(canViewDashboardSection(selfOnlyPermissions, "staffAttendance")).toBe(false);
    expect(source("src/app/(dashboard)/dashboard/page.tsx")).toContain("getMobileStaffAttendanceStatus(ctx)");
  });

  it("adds mobile dashboard and reusable mobile cards without replacing desktop dashboard", () => {
    const dashboardPage = source("src/app/(dashboard)/dashboard/page.tsx");
    const mobileDashboard = source("src/modules/dashboard/components/mobile-dashboard.tsx");
    const actionCard = source("src/components/mobile/mobile-action-card.tsx");
    const statCard = source("src/components/mobile/mobile-stat-card.tsx");
    const listCard = source("src/components/mobile/mobile-list-card.tsx");
    const emptyState = source("src/components/mobile/mobile-empty-state.tsx");
    const stickyAction = source("src/components/mobile/mobile-sticky-action.tsx");

    expect(dashboardPage).toContain("MobileDashboard");
    expect(dashboardPage).toContain('data-desktop-dashboard="true"');
    expect(mobileDashboard).toContain('data-mobile-dashboard="true"');
    expect(mobileDashboard).toContain("Today's Operations");
    expect(`${actionCard}\n${statCard}\n${listCard}\n${emptyState}\n${stickyAction}`).toContain("rounded-lg");
    expect(stickyAction).toContain("env(safe-area-inset-bottom)");
  });

  it("makes the Staff QR scanner page mobile-first while preserving secure server gating", () => {
    const scanPage = source("src/app/(dashboard)/staffboard/attendance/scan/page.tsx");
    const scanForm = source("src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx");
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanPage).toContain('data-mobile-qr-scan-page="true"');
    expect(scanPage).toContain('data-desktop-qr-scan-page="true"');
    expect(scanPage).toContain('staffboard.attendance.self_scan');
    expect(scanPage).toContain('StaffQrScanForm variant="mobile"');
    expect(scanForm).toContain('variant?: "default" | "mobile"');
    expect(scanner).toContain('data-qr-scan-frame="true"');
    expect(scanner).toContain("aspect-square");
    expect(scanner).toContain("Place the live school QR inside the square");
    expect(scanner).toContain("Start Camera");
    expect(scanner).toContain("Upload QR image/photo");
    expect(scanner).toContain("Camera requires a secure HTTPS connection");
  });

  it("uses mobile cards for dense CampusCore lists and avoids sensitive output", () => {
    const combined = [
      source("src/app/(dashboard)/campus-core/users/page.tsx"),
      source("src/app/(dashboard)/campus-core/branches/page.tsx"),
      source("src/app/(dashboard)/campus-core/academic-years/page.tsx"),
      source("src/components/app-shell/mobile-bottom-nav.tsx"),
      source("src/modules/dashboard/components/mobile-dashboard.tsx"),
    ].join("\n");

    expect(combined).toContain('data-mobile-user-cards="true"');
    expect(combined).toContain('data-mobile-branch-cards="true"');
    expect(combined).toContain('data-mobile-academic-year-cards="true"');
    expect(combined).toContain("hidden md:block");
    expect(combined).not.toMatch(/passwordHash|tokenHash|rawToken|FeeDesk|GradeBook|SchoolCast|payroll|biometric/i);
  });
});
