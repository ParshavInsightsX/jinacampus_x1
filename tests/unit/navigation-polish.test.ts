import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import {
  getActiveNavHref,
  getNavigationAudience,
  getPrimaryMobileNavigationItems,
  getVisibleNavigationGroups,
  isNavItemActive,
  MOBILE_NAVIGATION_SHORTCUTS,
  NAVIGATION_GROUPS
} from "@/components/app-shell/navigation";
import { DASHBOARD_QUICK_ACTIONS, getVisibleDashboardQuickActions } from "@/modules/dashboard/components/dashboard-state";

function allPermissionSet() {
  return new Set<PermissionCode>(ALL_PERMISSIONS);
}

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("navigation polish", () => {
  it("renders the completed MVP navigation groups", () => {
    expect(NAVIGATION_GROUPS.map((group) => group.title)).toEqual([
      "Dashboard",
      "CampusCore",
      "Academia",
      "GradeBook",
      "SchoolCast",
      "StaffBoard Lite"
    ]);
  });

  it("points Academia attendance links to real completed routes", () => {
    const academiaItems = NAVIGATION_GROUPS.find((group) => group.title === "Academia")?.items ?? [];

    expect(academiaItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Student Attendance", href: "/academia/attendance" }),
        expect.objectContaining({ title: "Student Attendance Reports", href: "/academia/attendance/reports" })
      ])
    );
    expect(readProjectFile("src/app/(dashboard)/academia/attendance/page.tsx")).toContain("Student Attendance");
    expect(readProjectFile("src/app/(dashboard)/academia/attendance/reports/page.tsx")).toContain("Student Attendance Reports");
  });

  it("points StaffBoard attendance links to real completed routes", () => {
    const staffboardItems = NAVIGATION_GROUPS.find((group) => group.title === "StaffBoard Lite")?.items ?? [];

    expect(staffboardItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Staff Attendance", href: "/staffboard/attendance" }),
        expect.objectContaining({ title: "QR Console", href: "/staffboard/attendance/qr" }),
        expect.objectContaining({ title: "Scan QR", href: "/staffboard/attendance/scan" }),
        expect.objectContaining({ title: "Staff Reports", href: "/staffboard/attendance/reports" })
      ])
    );
    for (const path of [
      "src/app/(dashboard)/staffboard/attendance/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/qr/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/scan/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/reports/page.tsx"
    ]) {
      expect(readProjectFile(path)).not.toMatch(/coming soon/i);
    }
  });

  it("uses the most specific active state for nested Academia routes", () => {
    const groups = getVisibleNavigationGroups(allPermissionSet());

    expect(getActiveNavHref(groups, "/academia/attendance/mark")).toBe("/academia/attendance");
    expect(getActiveNavHref(groups, "/academia/attendance/reports")).toBe("/academia/attendance/reports");
    expect(getActiveNavHref(groups, "/academia/students/student-1/edit")).toBe("/academia/students");
    expect(getActiveNavHref(groups, "/academia/classes/class-1/edit")).toBe("/academia/setup");
  });

  it("uses one Academic Setup navigation entry instead of technical record menus", () => {
    const academiaItems = NAVIGATION_GROUPS.find((group) => group.title === "Academia")?.items ?? [];

    expect(academiaItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Academic Setup", href: "/academia/setup" })
      ])
    );
    expect(academiaItems.map((item) => item.title)).not.toEqual(
      expect.arrayContaining(["Classes", "Sections", "Class Sections", "Subjects", "Guardians", "Enrollments"])
    );
  });

  it("uses the most specific active state for nested CampusCore user routes", () => {
    const groups = getVisibleNavigationGroups(allPermissionSet());

    expect(getActiveNavHref(groups, "/campus-core/users/user-1")).toBe("/campus-core/users");
    expect(getActiveNavHref(groups, "/campus-core/users/user-1/edit")).toBe("/campus-core/users");
    expect(getActiveNavHref(groups, "/campus-core/users/user-1/reset-password")).toBe("/campus-core/users");
  });

  it("uses the most specific active state for nested StaffBoard routes", () => {
    const groups = getVisibleNavigationGroups(allPermissionSet());

    expect(getActiveNavHref(groups, "/staffboard/attendance")).toBe("/staffboard/attendance");
    expect(getActiveNavHref(groups, "/staffboard/attendance/qr")).toBe("/staffboard/attendance/qr");
    expect(getActiveNavHref(groups, "/staffboard/attendance/scan")).toBe("/staffboard/attendance/scan");
    expect(getActiveNavHref(groups, "/staffboard/attendance/reports")).toBe("/staffboard/attendance/reports");
    expect(getActiveNavHref(groups, "/staffboard/staff/staff-1/edit")).toBe("/staffboard/staff");
  });

  it("does not double-highlight parent attendance links on specific StaffBoard routes", () => {
    const groups = getVisibleNavigationGroups(allPermissionSet());
    const items = groups.flatMap((group) => group.items);
    const activeHref = getActiveNavHref(groups, "/staffboard/attendance/scan");

    expect(
      items.filter((item) => isNavItemActive(item, "/staffboard/attendance/scan", activeHref)).map((item) => item.title)
    ).toEqual(["Scan QR"]);
  });

  it("keeps dashboard quick actions on real MVP routes", () => {
    expect(DASHBOARD_QUICK_ACTIONS.map((action) => action.href)).toEqual([
      "/academia/students",
      "/academia/attendance/mark",
      "/academia/attendance/reports",
      "/staffboard/attendance/qr",
      "/staffboard/attendance",
      "/staffboard/attendance/reports",
      "/staffboard/staff",
      "/staffboard/attendance/scan",
      "/staffboard/attendance/me"
    ]);
    expect(DASHBOARD_QUICK_ACTIONS.map((action) => action.label)).toEqual([
      "Manage Students",
      "Mark Student Attendance",
      "Student Reports",
      "Generate Staff QR",
      "Staff Attendance",
      "Staff Reports",
      "Manage Staff",
      "Scan QR",
      "My Attendance"
    ]);
  });

  it("keeps dashboard quick actions focused for admin, teacher, and staff permissions", () => {
    const adminPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.student.view",
      "academia.attendance.view",
      "academia.attendance.mark",
      "academia.attendance.report",
      "staffboard.staff.view",
      "staffboard.attendance.qr.generate",
      "staffboard.attendance.view",
      "staffboard.attendance.report",
      "staffboard.attendance.self_scan"
    ]);
    const teacherPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.attendance.view",
      "academia.attendance.mark",
      "academia.attendance.report",
      "staffboard.attendance.self_scan"
    ]);
    const staffPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.self_scan"
    ]);

    expect(getNavigationAudience(adminPermissions)).toBe("admin");
    expect(getNavigationAudience(teacherPermissions)).toBe("teacher");
    expect(getNavigationAudience(staffPermissions)).toBe("staff");
    expect(getVisibleDashboardQuickActions(adminPermissions).map((action) => action.label)).toEqual([
      "Manage Students",
      "Mark Student Attendance",
      "Student Reports",
      "Generate Staff QR",
      "Staff Attendance",
      "Staff Reports",
      "Manage Staff"
    ]);
    expect(getVisibleDashboardQuickActions(teacherPermissions).map((action) => action.label)).toEqual([
      "Mark Student Attendance",
      "Student Reports",
      "Scan QR"
    ]);
    expect(getVisibleDashboardQuickActions(staffPermissions).map((action) => action.label)).toEqual(["Scan QR"]);
  });

  it("builds role-focused mobile shortcuts without fake routes", () => {
    const teacherPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.attendance.view",
      "academia.attendance.mark",
      "academia.attendance.report",
      "staffboard.attendance.self_scan"
    ]);
    const staffPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.self_scan"
    ]);

    expect(getPrimaryMobileNavigationItems(teacherPermissions).map((item) => item.title)).toEqual([
      "Home",
      "Attendance",
      "Scan QR",
      "Reports"
    ]);
    expect(getPrimaryMobileNavigationItems(staffPermissions).map((item) => item.title)).toEqual([
      "Home",
      "Scan QR"
    ]);
    expect(MOBILE_NAVIGATION_SHORTCUTS.map((item) => item.href)).not.toEqual(
      expect.arrayContaining(["/feedesk"])
    );
  });

  it("filters StaffBoard admin links away from self-scan-only staff", () => {
    const groups = getVisibleNavigationGroups(new Set<PermissionCode>(["staffboard.attendance.self_scan"]));
    const staffboardItems = groups.find((group) => group.title === "StaffBoard Lite")?.items ?? [];

    expect(staffboardItems.map((item) => item.href)).toEqual([
      "/staffboard",
      "/staffboard/attendance/scan"
    ]);
    expect(staffboardItems.map((item) => item.title)).not.toEqual(
      expect.arrayContaining(["Staff Attendance", "QR Console", "Staff Reports"])
    );
  });

  it("keeps StaffBoard view, correction, QR, and report navigation permissions distinct", () => {
    const attendanceViewGroups = getVisibleNavigationGroups(new Set<PermissionCode>(["staffboard.attendance.view"]));
    const attendanceViewItems = attendanceViewGroups.find((group) => group.title === "StaffBoard Lite")?.items ?? [];

    expect(attendanceViewItems.map((item) => item.href)).toEqual([
      "/staffboard",
      "/staffboard/attendance"
    ]);
    expect(attendanceViewItems.map((item) => item.href)).not.toEqual(
      expect.arrayContaining([
        "/staffboard/attendance/qr",
        "/staffboard/attendance/scan",
        "/staffboard/attendance/reports"
      ])
    );

    const reportGroups = getVisibleNavigationGroups(new Set<PermissionCode>(["staffboard.attendance.report"]));
    const reportItems = reportGroups.find((group) => group.title === "StaffBoard Lite")?.items ?? [];
    expect(reportItems.map((item) => item.href)).toEqual([
      "/staffboard",
      "/staffboard/attendance/reports"
    ]);
  });

  it("requires the dashboard view permission for dashboard navigation", () => {
    expect(getVisibleNavigationGroups(new Set<PermissionCode>()).some((group) => group.title === "Dashboard")).toBe(false);

    const groups = getVisibleNavigationGroups(new Set<PermissionCode>(["campuscore.tenant.view"]));
    expect(groups.find((group) => group.title === "Dashboard")?.items).toEqual([
      expect.objectContaining({ title: "Dashboard", href: "/dashboard" })
    ]);
  });

  it("keeps the desktop launcher and mobile drawer scrollable for long role menus", () => {
    const dockSource = readProjectFile("src/components/app-shell/desktop-navigation-dock.tsx");
    const drawerSource = readProjectFile("src/components/app-shell/mobile-navigation-drawer.tsx");
    const globalStyles = readProjectFile("src/app/globals.css");

    expect(dockSource).toContain('data-desktop-module-launcher="true"');
    expect(dockSource).toContain("max-h-[min(30rem,calc(100vh-14rem))]");
    expect(dockSource).toContain("overflow-y-auto");
    expect(drawerSource).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(globalStyles).toContain(".premium-nav-scroll");
    expect(globalStyles).toContain("scrollbar-width: thin");
  });

  it("supports an adaptive labelled desktop dock without a rendered sidebar", () => {
    const dockSource = readProjectFile("src/components/app-shell/desktop-navigation-dock.tsx");
    const layoutSource = readProjectFile("src/app/(dashboard)/layout.tsx");

    expect(dockSource).toContain("getDesktopDockNavigationItems(groups)");
    expect(dockSource).toContain('w-[clamp(6rem,7.5vw,7.25rem)]');
    expect(dockSource).toContain('max-w-[calc(100vw-2rem)]');
    expect(dockSource).toContain("{item.title}");
    expect(dockSource).toContain("<NavigationIcon href={item.iconHref}");
    expect(layoutSource).not.toContain("DesktopShell");
    expect(readProjectFile("src/components/app-shell/navigation-icon.tsx")).toContain("navigationIconsByHref");
  });

  it("keeps the contextual command bar account menu and workspace context available", () => {
    const navbarSource = [
      readProjectFile("src/components/app-shell/app-navbar.tsx"),
      readProjectFile("src/components/app-shell/navbar-context-menu.tsx"),
      readProjectFile("src/components/app-shell/navbar-user-menu.tsx"),
      readProjectFile("src/components/app-shell/navbar-sign-out-button.tsx")
    ].join("\n");

    expect(navbarSource).toContain('data-app-navbar="true"');
    expect(navbarSource).toContain('dataAttribute="account"');
    expect(navbarSource).toContain("Current workspace");
    expect(navbarSource).toContain("Academic year");
    expect(navbarSource).toContain("Account security");
    expect(navbarSource).toContain("Sign out");
    expect(navbarSource).toContain('action="/api/auth/logout"');
    expect(navbarSource).toContain('panelRole="dialog"');
    expect(navbarSource).not.toContain('panelRole="menu"');
    expect(navbarSource).not.toMatch(/passwordHash|tokenHash|rawToken/i);
  });

  it("keeps bottom StaffBoard and settings navigation items reachable in the role-aware DOM", () => {
    const groups = getVisibleNavigationGroups(allPermissionSet());
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));

    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/campus-core/settings",
        "/campus-core/audit-logs",
        "/staffboard/attendance/qr",
        "/staffboard/attendance/scan",
        "/staffboard/attendance/reports"
      ])
    );
  });

  it("does not add out-of-scope module navigation or expose QR secrets", () => {
    const combinedSource = [
      "src/components/app-shell/navigation.ts",
      "src/components/app-shell/desktop-navigation-dock.tsx",
      "src/modules/dashboard/components/dashboard-state.ts"
    ].map(readProjectFile).join("\n");

    expect(combinedSource).not.toMatch(/FeeDesk|InsightBoard|payroll|biometric/i);
    expect(combinedSource).not.toMatch(/tokenHash|rawToken/i);
  });
});
