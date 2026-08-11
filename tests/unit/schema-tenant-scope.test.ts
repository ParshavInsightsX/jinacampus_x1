import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

function getModelBlock(modelName: string) {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match) throw new Error(`Missing Prisma model: ${modelName}`);
  return match[1];
}

describe("CampusCore Prisma tenant scoping", () => {
  it.each([
    "Institution",
    "Branch",
    "AcademicYear",
    "User",
    "Session",
    "Role",
    "RolePermission",
    "UserRoleAssignment",
    "UserBranchAccess",
    "TenantSettings",
    "AttendanceSetting",
    "AuditLog",
    "StaffProfile",
    "StaffAttendanceRecord",
    "StaffAttendanceQrToken",
    "StudentDocument",
    "ClassSectionSubject",
    "GradebookAssessment",
    "GradebookMark"
  ])("%s includes tenantId", (modelName) => {
    expect(getModelBlock(modelName)).toMatch(/\btenantId\s+String\b/);
  });

  it.each(["UserBranchAccess", "AttendanceSetting", "AuditLog", "StaffProfile", "StaffAttendanceRecord", "StaffAttendanceQrToken", "StudentDocument", "ClassSectionSubject", "GradebookAssessment", "GradebookMark"])("%s includes branch scoping", (modelName) => {
    expect(getModelBlock(modelName)).toMatch(/\bbranchId\s+String\??(?:\s|$)/);
  });
});
