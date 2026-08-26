import { describe, expect, it } from "vitest";
import type { PermissionCode } from "@/lib/rbac/permissions";
import {
  academiaAttendanceRoutes,
  academiaListPageConfigs,
  academiaModuleCards,
  getVisibleAcademiaModuleCards
} from "@/modules/academia/ui-config";

describe("Academia UI route config", () => {
  it("defines the required Academia admin routes", () => {
    expect(academiaModuleCards.map((card) => card.href).filter(Boolean)).toEqual([
      "/academia/setup",
      "/academia/students",
      "/academia/promotions",
      "/academia/attendance"
    ]);
  });

  it("links student attendance to the Phase 3.6 route", () => {
    const attendance = academiaModuleCards.find((card) => card.key === "attendance");

    expect(attendance).toMatchObject({
      title: "Attendance",
      href: "/academia/attendance"
    });
    expect(academiaAttendanceRoutes).toEqual({
      overview: "/academia/attendance",
      mark: "/academia/attendance/mark",
      reports: "/academia/attendance/reports",
      coverage: "/academia/attendance/coverage"
    });
  });

  it("filters overview cards to the user's Academia permissions", () => {
    const teacherPermissions = new Set<PermissionCode>([
      "academia.attendance.view",
      "academia.attendance.mark",
      "academia.attendance.report"
    ]);

    expect(getVisibleAcademiaModuleCards(teacherPermissions).map((card) => card.href)).toEqual([
      "/academia/attendance"
    ]);
  });

  it("includes the requested columns for list pages", () => {
    expect(academiaListPageConfigs.classes.columns).toEqual([
      "Name",
      "Code",
      "Status",
      "Sort Order",
      "Updated At",
      "Actions"
    ]);
    expect(academiaListPageConfigs.students.columns).toContain("Scholar / Admission No.");
    expect(academiaListPageConfigs.students.columns).toContain("Father / Guardian");
    expect(academiaListPageConfigs.students.columns).toContain("Category");
    expect(academiaListPageConfigs.students.columns).toContain("Current Class Section");
    expect(academiaListPageConfigs.enrollments.columns).toContain("Enrollment Date");
  });
});
