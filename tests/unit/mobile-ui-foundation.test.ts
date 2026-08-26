import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { getVisibleNavigationGroups } from "@/components/app-shell/navigation";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("mobile UI foundation", () => {
  it("keeps mobile navigation grouped and exposes completed MVP links", () => {
    const source = readProjectFile("src/components/app-shell/sidebar-nav.tsx");
    const groups = getVisibleNavigationGroups(new Set<PermissionCode>(ALL_PERMISSIONS));
    const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));

    expect(source).toContain('data-mobile-navigation="true"');
    expect(source).toContain("<details");
    expect(source).toContain("data-nav-scroll-area=\"mobile\"");
    expect(source).toContain("overflow-y-auto overflow-x-hidden");
    expect(source).toContain("flex min-h-11");
    expect(hrefs).toEqual(expect.arrayContaining([
      "/dashboard",
      "/academia/attendance",
      "/academia/attendance/reports",
      "/staffboard/attendance",
      "/staffboard/attendance/credentials",
      "/staffboard/attendance/card",
      "/staffboard/attendance/scan",
      "/staffboard/attendance/reports"
    ]));
  });

  it("adds mobile viewport and app metadata for responsive web readiness", () => {
    const source = readProjectFile("src/app/layout.tsx");

    expect(source).toContain("applicationName");
    expect(source).toContain("themeColor");
    expect(source).toContain('width: "device-width"');
    expect(source).not.toMatch(/serviceWorker|navigator\.serviceWorker|offline/i);
  });

  it("keeps dashboard cards and quick actions responsive", () => {
    const dashboardSource = readProjectFile("src/app/(dashboard)/dashboard/page.tsx");
    const cardSource = readProjectFile("src/modules/dashboard/components/dashboard-metric-card.tsx");
    const groupSource = readProjectFile("src/modules/dashboard/components/dashboard-metric-group.tsx");
    const attentionSource = readProjectFile("src/modules/dashboard/components/dashboard-attention-panel.tsx");
    const quickActionSource = readProjectFile("src/modules/dashboard/components/dashboard-quick-actions.tsx");
    const headerSource = readProjectFile("src/modules/dashboard/components/dashboard-page-header.tsx");

    expect(groupSource).toContain("sm:grid-cols-2");
    expect(attentionSource).toContain("md:grid-cols-2 xl:grid-cols-4");
    expect(cardSource).toContain("min-w-0");
    expect(cardSource).toContain("break-words");
    expect(quickActionSource).toContain("min-h-24");
    expect(headerSource).toContain("xl:grid-cols-4");
    expect(headerSource).toContain("DashboardLiveClock");
    expect(dashboardSource).toContain("Today's Attendance");
  });

  it("renders teacher attendance with mobile cards and touch-sized controls", () => {
    const formSource = readProjectFile("src/modules/academia/components/attendance/attendance-mark-form.tsx");
    const tableSource = readProjectFile("src/modules/academia/components/attendance/attendance-student-table.tsx");
    const selectSource = readProjectFile("src/modules/academia/components/attendance/attendance-status-select.tsx");

    expect(tableSource).toContain('data-mobile-student-attendance-cards="true"');
    expect(tableSource).toContain("md:hidden");
    expect(tableSource).toContain("hidden overflow-hidden");
    expect(formSource).toContain("Mark All Present");
    expect(formSource).toContain("premium-primary-button w-full");
    expect(selectSource).toContain("min-h-11");
  });

  it("keeps staff cards and supervised scanning mobile-safe", () => {
    const operatorScanner = readProjectFile("src/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner.tsx");
    const tokenInputSource = readProjectFile("src/modules/staffboard-lite/components/attendance/staff-qr-manual-token-input.tsx");
    const identityCard = readProjectFile("src/modules/staffboard-lite/components/attendance/staff-identity-card.tsx");
    const legacyRoute = readProjectFile("src/app/(dashboard)/staffboard/attendance/qr/page.tsx");

    expect(tokenInputSource).toContain("min-h-36");
    expect(operatorScanner).toContain("StaffQrCameraScanner");
    expect(operatorScanner).toContain("recordSupervisedStaffQrScanAction");
    expect(operatorScanner).toContain("StaffQrManualTokenInput");
    expect(identityCard).toContain("QRCodeSVG");
    expect(identityCard).toContain("identity-card-digital-only");
    expect(legacyRoute).toContain('redirect("/staffboard/attendance/credentials")');
    expect(legacyRoute).toContain('redirect("/staffboard/attendance/card")');
    expect(`${operatorScanner}\n${tokenInputSource}\n${identityCard}`).not.toMatch(/tokenHash|rawToken/i);
  });
  it("uses responsive table wrappers for report and admin tables", () => {
    const academiaShell = readProjectFile("src/modules/academia/components/academia-page-shell.tsx");
    const staffShell = readProjectFile("src/modules/staffboard-lite/components/staffboard-page-shell.tsx");
    const tablePrimitives = readProjectFile("src/components/ui/table-primitives.tsx");
    const staffReportFilters = readProjectFile("src/modules/staffboard-lite/components/attendance/staff-attendance-report-filters.tsx");
    const studentReportPage = readProjectFile("src/app/(dashboard)/academia/attendance/reports/page.tsx");

    expect(academiaShell).toContain("ResponsiveTable");
    expect(staffShell).toContain("ResponsiveTable");
    expect(tablePrimitives).toContain('data-mobile-table-shell="true"');
    expect(tablePrimitives).not.toContain("Scroll sideways to view all columns.");
    expect(staffReportFilters).toContain("premium-primary-button");
    expect(studentReportPage).toContain("premium-primary-button");
    expect(studentReportPage).toContain("DailySummaryMobileList");
  });

  it("keeps protected mobile-priority routes on server-side auth paths", () => {
    for (const path of [
      "src/app/(dashboard)/academia/attendance/mark/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/scan/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/qr/page.tsx",
      "src/app/(dashboard)/staffboard/attendance/page.tsx",
      "src/app/(dashboard)/dashboard/page.tsx"
    ]) {
      expect(readProjectFile(path)).toContain("requireAuth");
    }
  });
});
