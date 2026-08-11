import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("empty loading and error state polish", () => {
  it("adds reusable state components with mobile-safe actions and safe alert roles", () => {
    const stateSource = source("src/components/ui/empty-state.tsx");

    expect(stateSource).toContain("EmptyState");
    expect(stateSource).toContain("LoadingState");
    expect(stateSource).toContain("ErrorState");
    expect(stateSource).toContain("PermissionState");
    expect(stateSource).toContain("NoResultsState");
    expect(stateSource).toContain("PrerequisiteState");
    expect(stateSource).toContain("actionLabel");
    expect(stateSource).toContain("actionHref");
    expect(stateSource).toContain('role?: "alert" | "status"');
    expect(stateSource).toContain('role="alert"');
    expect(stateSource).toContain('role="status"');
    expect(stateSource).toContain("min-h-11 w-full");
  });

  it("separates true empty states from no-results states on list pages", () => {
    const academiaShell = source("src/modules/academia/components/academia-page-shell.tsx");
    const staffShell = source("src/modules/staffboard-lite/components/staffboard-page-shell.tsx");
    const academiaConfig = source("src/modules/academia/ui-config.ts");
    const staffConfig = source("src/modules/staffboard-lite/ui-config.ts");

    expect(academiaShell).toContain("NoResultsState");
    expect(staffShell).toContain("NoResultsState");
    expect(academiaShell).toContain("clear the search to see all available records");
    expect(staffShell).toContain("clear the search to see all available records");
    expect(academiaConfig).toContain("Enroll students into active class sections before marking attendance.");
    expect(staffConfig).toContain("Add your first staff profile so QR attendance, correction, and reports can be used.");
    expect(`${academiaConfig}\n${staffConfig}`).not.toMatch(/No data|Undefined|Prisma error/i);
  });

  it("polishes student attendance loading, prerequisite, locked, and error states", () => {
    const formSource = source("src/modules/academia/components/attendance/attendance-mark-form.tsx");
    const emptyStateSource = source("src/modules/academia/components/attendance/attendance-empty-state.tsx");
    const lockedSource = source("src/modules/academia/components/attendance/attendance-locked-alert.tsx");

    expect(formSource).toContain("LoadingState");
    expect(formSource).toContain("ErrorState");
    expect(formSource).toContain("Loading students...");
    expect(formSource).toContain("No active enrolled students");
    expect(formSource).toContain("Add active enrollments for this class-section before marking attendance.");
    expect(formSource).toContain('kind={classSections.length === 0 || Boolean(loadedState) ? "prerequisite" : "empty"}');
    expect(emptyStateSource).toContain("PrerequisiteState");
    expect(lockedSource).toContain("Attendance is locked");
  });

  it("uses safe QR display and scan states without exposing QR secrets", () => {
    const displaySource = source("src/modules/staffboard-lite/components/attendance/staff-qr-display.tsx");
    const scanSource = source("src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx");
    const scanStateSource = source("src/modules/staffboard-lite/components/attendance/staff-qr-scan-state.ts");
    const scannerSource = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");
    const resultSource = source("src/modules/staffboard-lite/components/attendance/staff-qr-scan-result.tsx");

    expect(displaySource).toContain("ErrorState");
    expect(displaySource).toContain("No active QR generated");
    expect(displaySource).toContain("QR expired");
    expect(scanSource).toContain("staffQrScanErrorTitle(error.code)");
    expect(scanStateSource).toContain("Scan could not be completed");
    expect(scanStateSource).toContain("Enter a valid QR token before submitting.");
    expect(scannerSource).toContain("Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link.");
    expect(scannerSource).toContain("Camera is not available in this browser context. Use the approved HTTPS link in Safari/Chrome.");
    expect(scannerSource).toContain("Camera diagnostics");
    expect(scannerSource).toContain("Upload QR image/photo");
    expect(`${displaySource}\n${scanSource}\n${scanStateSource}\n${scannerSource}\n${resultSource}`).not.toMatch(
      /tokenHash|rawToken|tenantId|Prisma/i
    );
  });

  it("renders no-results states for attendance reports and admin tables", () => {
    const studentReports = source("src/app/(dashboard)/academia/attendance/reports/page.tsx");
    const staffReports = source("src/modules/staffboard-lite/components/attendance/staff-attendance-report-tables.tsx");
    const staffAdmin = source("src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx");

    expect(studentReports).toContain("NoResultsState");
    expect(staffReports).toContain("NoResultsState");
    expect(staffAdmin).toContain("NoResultsState");
    expect(studentReports).toContain("No daily attendance found");
    expect(staffReports).toContain("No monthly staff attendance rows");
    expect(staffAdmin).toContain("No staff attendance rows found");
  });

  it("uses safe dashboard permission and route error states without a route-group loading trap", () => {
    const dashboardPage = source("src/app/(dashboard)/dashboard/page.tsx");
    const dashboardEmpty = source("src/modules/dashboard/components/dashboard-empty-state.tsx");
    const emptyState = source("src/components/ui/empty-state.tsx");
    const error = source("src/app/(dashboard)/error.tsx");

    expect(dashboardPage).toContain("PermissionState");
    expect(dashboardPage).toContain("No active academic year");
    expect(dashboardEmpty).toContain("EmptyState");
    expect(emptyState).toContain("LoadingState");
    expect(existsSync(resolve(process.cwd(), "src/app/(dashboard)/loading.tsx"))).toBe(false);
    expect(error).toContain("ErrorState");
    expect(`${dashboardPage}\n${emptyState}\n${error}`).not.toMatch(/Prisma|tokenHash|rawToken|tenantId=.*secret/i);
  });
});
