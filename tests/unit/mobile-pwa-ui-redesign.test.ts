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
  it("uses a compact mobile command bar, floating dock, and bottom-sheet navigation", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const appChrome = source("src/components/app-shell/app-chrome.tsx");
    const appNavbar = source("src/components/app-shell/app-navbar.tsx");
    const desktopDock = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const mobileModuleSheet = source("src/components/app-shell/mobile-module-sheet.tsx");
    const mobileContextSheet = source("src/components/app-shell/mobile-context-sheet.tsx");
    const mobileBottomNav = source("src/components/app-shell/mobile-bottom-nav.tsx");

    expect(layout).not.toContain("DesktopShell");
    expect(layout).toContain('data-adaptive-app-shell="jinaglass-mobile-1.0"');
    expect(appChrome).toContain("ConnectivityBanner");
    expect(appChrome).toContain("MobileModuleSheet");
    expect(appNavbar).toContain('data-app-navbar="true"');
    expect(appNavbar).toContain("MobileContextSheet");
    expect(desktopDock).toContain("hidden justify-center");
    expect(desktopDock).toContain("lg:flex");
    expect(mobileModuleSheet).toContain('data-mobile-module-sheet="true"');
    expect(mobileContextSheet).toContain('data-mobile-context-overlay="true"');
    expect(mobileBottomNav).toContain('data-mobile-dock="true"');
    expect(mobileBottomNav).toContain("pb-[calc(0.5rem+env(safe-area-inset-bottom))]");
    expect(mobileBottomNav).toContain("data-mobile-dock-field-focused");
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
      "staffboard.attendance.credential.self_view",
      "staffboard.attendance.self_view",
    ]);
    const officePermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.staff.view",
      "staffboard.attendance.view",
      "staffboard.attendance.report",
      "staffboard.attendance.scan",
      "staffboard.attendance.credential.self_view",
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
      "My Attendance",
      "Attendance History",
      "Profile",
      "More",
    ]);
    expect(getNavigationAudience(officePermissions, ["OFFICE_STAFF"])).toBe("office");
    expect(getMobileBottomNavigationItems(officePermissions, ["OFFICE_STAFF"]).map((item) => item.title)).toEqual([
      "Home",
      "Attendance",
      "Staff Attendance",
      "My Attendance",
      "More",
    ]);
  });

  it("keeps self-only staff permissions out of branch-wide attendance metrics", () => {
    const selfOnlyPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.credential.self_view",
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

  it("makes supervised Staff QR scanning mobile-first while preserving server gating", () => {
    const scanPage = source("src/app/(dashboard)/staffboard/attendance/scan/page.tsx");
    const operatorScanner = source("src/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner.tsx");
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanPage).toContain('data-mobile-qr-scan-page="true"');
    expect(scanPage).toContain('data-desktop-qr-scan-page="true"');
    expect(scanPage).toContain('permissions.has("staffboard.attendance.scan")');
    expect(scanPage).toContain("StaffAttendanceOperatorScanner");
    expect(scanPage).toContain("Staff cannot scan their own attendance");
    expect(operatorScanner).toContain("StaffQrCameraScanner");
    expect(operatorScanner).toContain("recordSupervisedStaffQrScanAction");
    expect(operatorScanner).toContain("StaffQrManualTokenInput");
    expect(operatorScanner).toContain("autoStart");
    expect(operatorScanner).toContain("continuous");
    expect(operatorScanner).toContain('preferredFacingMode="user"');
    expect(operatorScanner).toContain("showPrimaryControls={false}");
    expect(operatorScanner).not.toContain("Scan Next Staff Member");
    expect(scanner).toContain('data-qr-scan-frame="true"');
    expect(scanner).toContain("aspect-square");
    expect(scanner).toContain("if (!autoStart || disabled) return;");
    expect(scanner).toContain("window.setTimeout(() => void startCamera(), 0)");
    expect(scanner).not.toContain("autoStartAttemptedRef");
    expect(scanner).toContain("Upload QR image/photo");
    expect(scanner).toContain("Camera requires a secure HTTPS connection");
  });

  it("uses accessible mobile sheets and truthful connectivity states", () => {
    const moduleSheet = source("src/components/app-shell/mobile-module-sheet.tsx");
    const contextSheet = source("src/components/app-shell/mobile-context-sheet.tsx");
    const filterSheet = source("src/components/mobile/mobile-filter-sheet.tsx");
    const connectivity = source("src/components/app-shell/connectivity-banner.tsx");
    const combinedSheets = `${moduleSheet}\n${contextSheet}\n${filterSheet}`;

    expect(combinedSheets).toContain('role="dialog"');
    expect(combinedSheets).toContain('aria-modal="true"');
    expect(combinedSheets).toContain('event.key === "Escape"');
    expect(combinedSheets).toContain('event.key !== "Tab"');
    expect(combinedSheets).toContain('document.body.style.overflow = "hidden"');
    expect(moduleSheet).toContain("returnFocusRef.current?.focus()");
    expect(connectivity).toContain('data-connectivity-banner="offline"');
    expect(connectivity).toContain("Server-verified actions are unavailable");
    expect(connectivity).not.toMatch(/saved offline|sync later/i);
  });

  it("uses mobile records for priority directories and attendance reports", () => {
    const combined = [
      source("src/app/(dashboard)/campus-core/users/page.tsx"),
      source("src/app/(dashboard)/campus-core/branches/page.tsx"),
      source("src/app/(dashboard)/campus-core/academic-years/page.tsx"),
      source("src/app/(dashboard)/campus-core/institutions/page.tsx"),
      source("src/app/(dashboard)/campus-core/roles/page.tsx"),
      source("src/app/(dashboard)/campus-core/audit-logs/page.tsx"),
      source("src/app/(dashboard)/academia/students/page.tsx"),
      source("src/app/(dashboard)/staffboard/staff/page.tsx"),
      source("src/app/(dashboard)/academia/attendance/reports/page.tsx"),
      source("src/modules/academia/components/attendance/mobile-attendance-report-lists.tsx"),
      source("src/components/mobile/mobile-data-list.tsx")
    ].join("\n");

    expect(combined).toContain('data-mobile-user-cards="true"');
    expect(combined).toContain('data-mobile-branch-cards="true"');
    expect(combined).toContain('data-mobile-academic-year-cards="true"');
    expect(combined).toContain('data-mobile-data-list="true"');
    expect(combined).toContain("DailySummaryMobileList");
    expect(combined).toContain("MonthlyPercentageMobileList");
    expect(combined).toContain("hidden md:block");
    expect(combined).not.toMatch(/passwordHash|tokenHash|rawToken|FeeDesk|SchoolCast|payroll|biometric/i);
  });
});
