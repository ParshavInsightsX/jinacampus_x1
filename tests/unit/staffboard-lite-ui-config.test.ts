import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PermissionCode } from "@/lib/rbac/permissions";
import {
  getVisibleStaffboardModuleCards,
  staffboardModuleCards,
  staffboardRoutes,
  staffCategoryCards,
  staffProfileListConfig
} from "@/modules/staffboard-lite/ui-config";

const routeFiles = [
  "src/app/(dashboard)/staffboard/page.tsx",
  "src/app/(dashboard)/staffboard/staff/page.tsx",
  "src/app/(dashboard)/staffboard/categories/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/qr/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/card/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/scan/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/credentials/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/adjustments/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/me/page.tsx",
  "src/app/(dashboard)/staffboard/attendance/reports/page.tsx",
  "src/app/(dashboard)/staffboard/leave/page.tsx",
  "src/app/(dashboard)/staffboard/leave/apply/page.tsx",
  "src/app/(dashboard)/staffboard/leave/review/page.tsx",
  "src/app/(dashboard)/staffboard/leave/settings/page.tsx"
] as const;

describe("StaffBoard Lite UI route config", () => {
  it("defines the StaffBoard route map", () => {
    expect(staffboardRoutes).toEqual({
      overview: "/staffboard",
      staff: "/staffboard/staff",
      categories: "/staffboard/categories",
      attendance: "/staffboard/attendance",
      myAttendance: "/staffboard/attendance/me",
      myCard: "/staffboard/attendance/card",
      qr: "/staffboard/attendance/qr",
      scan: "/staffboard/attendance/scan",
      credentials: "/staffboard/attendance/credentials",
      adjustments: "/staffboard/attendance/adjustments",
      reports: "/staffboard/attendance/reports",
      leave: "/staffboard/leave",
      leaveReview: "/staffboard/leave/review"
    });
  });

  it("creates the required StaffBoard route files", () => {
    for (const file of routeFiles) {
      expect(existsSync(resolve(process.cwd(), file))).toBe(true);
    }
  });

  it("defines overview cards without stale coming-soon placeholders", () => {
    expect(staffboardModuleCards.map((card) => card.href)).toEqual([
      "/staffboard/staff",
      "/staffboard/categories",
      "/staffboard/attendance",
      "/staffboard/attendance/me",
      "/staffboard/attendance/scan",
      "/staffboard/attendance/credentials",
      "/staffboard/attendance/adjustments",
      "/staffboard/attendance/card",
      "/staffboard/attendance/reports",
      "/staffboard/leave",
      "/staffboard/leave/review"
    ]);
    expect(staffboardModuleCards.map((card) => card.key)).toContain("attendance");
    expect(staffboardModuleCards.map((card) => card.title)).toContain("Staff QR Cards");
    expect(staffboardModuleCards.filter((card) => card.status === "coming-soon")).toEqual([]);
  });

  it("filters overview cards to StaffBoard permissions", () => {
    const staffPermissions = new Set<PermissionCode>(["staffboard.attendance.self_view"]);

    expect(getVisibleStaffboardModuleCards(staffPermissions).map((card) => card.href)).toEqual([
      "/staffboard/attendance/me"
    ]);
  });

  it("defines the staff profile list columns", () => {
    expect(staffProfileListConfig.columns).toEqual([
      "Employee Code",
      "Staff Name",
      "Staff Type",
      "Designation",
      "Department",
      "Branch",
      "Employment Status",
      "App Access",
      "Updated At",
      "Actions"
    ]);
  });

  it("defines all StaffBoard Lite categories without out-of-scope categories", () => {
    expect(staffCategoryCards.map((category) => category.value)).toEqual([
      "TEACHER",
      "ADMIN",
      "ACCOUNTANT",
      "LIBRARIAN",
      "DRIVER",
      "HELPER",
      "SECURITY",
      "PEON",
      "CLEANING_STAFF",
      "MANAGEMENT",
      "OTHER"
    ]);
    expect(staffCategoryCards.map((category) => category.value).join(" ")).not.toMatch(/PAYROLL|LEAVE|APPRAISAL/i);
  });

  it("adds StaffBoard attendance and approved leave navigation without payroll or appraisal links", () => {
    const navigationSource = readFileSync(resolve(process.cwd(), "src/components/app-shell/navigation.ts"), "utf8");

    expect(navigationSource).toContain("StaffBoard Lite");
    expect(navigationSource).toContain("Categories");
    expect(navigationSource).toContain("Attendance Register");
    expect(navigationSource).toContain("Staff QR Cards");
    expect(navigationSource).toContain("Mark Attendance");
    expect(navigationSource).toContain("Attendance Reports");
    expect(navigationSource).toContain("My Leave");
    expect(navigationSource).toContain("Leave Review");
    expect(navigationSource).toContain("/staffboard/staff");
    expect(navigationSource).toContain("/staffboard/categories");
    expect(navigationSource).toContain("/staffboard/attendance/credentials");
    expect(navigationSource).toContain("/staffboard/attendance/card");
    expect(navigationSource).not.toContain('{ title: "Shared Attendance QR"');
    expect(navigationSource).toContain("/staffboard/attendance/scan");
    expect(navigationSource).toContain("/staffboard/attendance/reports");
    expect(navigationSource).toContain("/staffboard/leave");
    expect(navigationSource).not.toMatch(/payroll|appraisal/i);
  });

  it("protects StaffBoard routes through middleware", () => {
    const middlewareSource = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

    expect(middlewareSource).toContain("\"/staffboard\"");
    expect(middlewareSource).toContain("\"/staffboard/:path*\"");
  });
});
