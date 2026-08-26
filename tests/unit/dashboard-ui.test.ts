import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionCode } from "@/lib/rbac/permissions";
import {
  ADMIN_MOBILE_OPERATIONS,
  ADMIN_MOBILE_TOOLS,
  DASHBOARD_QUICK_ACTIONS,
  getVisibleAdminMobileActions,
  getVisibleDashboardQuickActions
} from "@/modules/dashboard/components/dashboard-state";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dashboard UI", () => {
  it("wires the dashboard route to server-side dashboard query services", () => {
    const routeSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");

    expect(routeSource).toContain("requireAuth");
    expect(routeSource).toContain("getCampusCoreDashboardMetrics");
    expect(routeSource).toContain("getAcademiaDashboardMetrics");
    expect(routeSource).toContain("getStudentAttendanceDashboardMetrics");
    expect(routeSource).toContain("getStudentAttendanceDashboardTrend");
    expect(routeSource).toContain("getStaffBoardDashboardMetrics");
    expect(routeSource).toContain("getStaffAttendanceDashboardMetrics");
    expect(routeSource).toContain("getStaffAttendanceDashboardTrend");
    expect(routeSource).not.toContain("@/lib/db");
    expect(routeSource).toContain("function loadDashboardPair");
    expect(routeSource.match(/await loadDashboardPair/g)).toHaveLength(4);
  });

  it("renders the dashboard header and expected metric labels", () => {
    const combinedSource = [
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/modules/dashboard/components/dashboard-page-header.tsx",
      "src/modules/dashboard/components/dashboard-metric-group.tsx",
      "src/modules/dashboard/components/dashboard-metric-card.tsx",
      "src/modules/dashboard/components/dashboard-visualizations.tsx"
    ].map(readProjectFile).join("\n");

    for (const label of [
      "School Operations Dashboard",
      "Welcome back",
      "Today's Attendance",
      "School Setup",
      "Academics",
      "StaffBoard Lite",
      "Quick Actions",
      "Branches",
      "Active Academic Year",
      "Users",
      "Roles",
      "Active Students",
      "Active Enrollments",
      "Students Marked Today",
      "Classes Not Marked",
      "Active Staff",
      "Staff Checked In",
      "Half day",
      "Not marked"
    ]) {
      expect(combinedSource).toContain(label);
    }
  });

  it("renders dashboard attention and empty attendance states", () => {
    const routeSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");
    const attentionSource = readProjectFile("src/modules/dashboard/components/dashboard-attention-panel.tsx");

    expect(routeSource).toContain("DashboardAttentionPanel");
    expect(routeSource).toContain("Absent students");
    expect(routeSource).toContain("Classes not marked");
    expect(routeSource).toContain("Late staff");
    expect(routeSource).toContain("Staff not marked");
    expect(routeSource).toContain("Attendance has not been marked yet today.");
    expect(routeSource).toContain("No staff check-ins recorded yet today.");
    expect(attentionSource).toContain('aria-label="Dashboard attention items"');
    expect(attentionSource).toContain('data-dashboard-attention-item="true"');
  });

  it("renders accessible visual reports for desktop and mobile without a chart dependency", () => {
    const routeSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");
    const visualSource = readProjectFile("src/modules/dashboard/components/dashboard-visualizations.tsx");
    const mobileSource = readProjectFile("src/modules/dashboard/components/mobile-dashboard.tsx");
    const packageSource = readProjectFile("package.json");

    expect(routeSource).toContain('data-dashboard-visual-report="true"');
    expect(visualSource).toContain('data-dashboard-trend-chart="true"');
    expect(visualSource).toContain('data-dashboard-status-mix="true"');
    expect(visualSource).toContain('<table className="sr-only">');
    expect(visualSource).toContain("Missing records are not treated as absence");
    expect(mobileSource).toContain("DashboardTrendChart");
    expect(packageSource).not.toMatch(/recharts|chart\.js|highcharts/i);
  });

  it("keeps quick actions limited to existing MVP routes and role permissions", () => {
    expect(DASHBOARD_QUICK_ACTIONS.map((action) => action.href)).toEqual([
      "/academia/students",
      "/academia/attendance/mark",
      "/academia/attendance/reports",
      "/staffboard/attendance/credentials",
      "/staffboard/attendance/scan",
      "/staffboard/attendance",
      "/staffboard/attendance/reports",
      "/staffboard/staff",
      "/staffboard/attendance/card",
      "/staffboard/attendance/me"
    ]);
    expect(DASHBOARD_QUICK_ACTIONS.map((action) => action.label)).toContain("Staff QR Cards");
    expect(DASHBOARD_QUICK_ACTIONS.map((action) => action.label)).toContain("Attendance Register");

    const permissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.attendance.view",
      "academia.attendance.mark",
      "staffboard.staff.view"
    ]);
    expect(getVisibleDashboardQuickActions(permissions).map((action) => action.href)).toEqual([
      "/academia/attendance/mark",
      "/staffboard/staff"
    ]);
  });

  it("keeps mobile administrator operations and tools permission-aware", () => {
    expect(ADMIN_MOBILE_OPERATIONS.map((action) => action.label)).toEqual([
      "Attendance",
      "Users",
      "Branches",
      "Academic Years",
      "Settings"
    ]);
    expect(ADMIN_MOBILE_TOOLS.map((action) => action.label)).toEqual([
      "Roles & Permissions",
      "Audit Logs",
      "Tenant Settings"
    ]);

    const permissions = new Set<PermissionCode>([
      "academia.attendance.view",
      "campuscore.user.view",
      "campuscore.audit.view"
    ]);

    expect(getVisibleAdminMobileActions(permissions, ADMIN_MOBILE_OPERATIONS).map((action) => action.label)).toEqual([
      "Attendance",
      "Users"
    ]);
    expect(getVisibleAdminMobileActions(permissions, ADMIN_MOBILE_TOOLS).map((action) => action.label)).toEqual([
      "Audit Logs"
    ]);
  });

  it("renders the dedicated mobile administrator dashboard sections", () => {
    const routeSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");
    const mobileDashboardSource = readProjectFile("src/modules/dashboard/components/mobile-dashboard.tsx");

    expect(routeSource).toContain("ADMIN_MOBILE_OPERATIONS");
    expect(routeSource).toContain("ADMIN_MOBILE_TOOLS");
    expect(mobileDashboardSource).toContain("Today's Operations");
    expect(mobileDashboardSource).toContain("Quick Stats");
    expect(mobileDashboardSource).toContain("Admin Tools");
  });

  it("renders the empty state used when dashboard data is unavailable", () => {
    const routeSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");
    const emptyStateSource = readProjectFile("src/modules/dashboard/components/dashboard-empty-state.tsx");

    expect(routeSource).toContain("Dashboard data unavailable");
    expect(routeSource).toContain("No active academic year");
    expect(routeSource).toContain("No branch context");
    expect(emptyStateSource).toContain("DashboardEmptyState");
  });

  it("does not expose QR token secrets or out-of-scope modules in dashboard UI", () => {
    const combinedSource = [
      "src/app/(dashboard)/dashboard/page.tsx",
      "src/modules/dashboard/components/dashboard-state.ts",
      "src/modules/dashboard/components/dashboard-quick-actions.tsx"
    ].map(readProjectFile).join("\n");

    expect(combinedSource).not.toMatch(/tokenHash|rawToken/i);
    expect(combinedSource).not.toMatch(/FeeDesk|GradeBook|payroll|biometric/i);
  });
});
