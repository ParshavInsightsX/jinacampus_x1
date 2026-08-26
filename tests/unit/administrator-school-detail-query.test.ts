import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    tenant: {
      findUnique: vi.fn()
    },
    tenantSubscription: {
      findUnique: vi.fn()
    },
    institutionEntitlement: {
      findMany: vi.fn()
    }
  },
  writePlatformAuditLog: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn()
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/platform-audit-log", () => ({ writePlatformAuditLog: mocks.writePlatformAuditLog }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

import {
  getSchoolByIdForAdministrator,
  getSchoolDependencySummary
} from "@/modules/campus-core/administrator-services";
import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";

const dependencyCounts = {
  institutions: 1,
  branches: 2,
  users: 3,
  students: 4,
  staffProfiles: 5,
  studentAttendanceRecords: 6,
  staffAttendanceRecords: 7,
  auditLogs: 8,
  notificationOutboxItems: 9,
  roles: 10,
  classSectionSubjects: 11,
  gradebookAssessments: 12,
  gradebookMarks: 13
};

const administratorContext: PlatformAdministratorContext = {
  administratorId: "platform-admin-id",
  sessionId: "platform-session-id",
  email: "administrator@example.test",
  displayName: "Platform Administrator",
  canManagePrincipalRecovery: false,
  passwordChangeRequired: false
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$queryRaw.mockResolvedValue([{
    subscriptionTableAvailable: true,
    entitlementTableAvailable: true
  }]);
  mocks.db.tenantSubscription.findUnique.mockResolvedValue(null);
  mocks.db.institutionEntitlement.findMany.mockResolvedValue([]);
});

describe("administrator school detail query", () => {
  it("loads school detail and dependency counts through one tenant query", async () => {
    mocks.db.tenant.findUnique.mockResolvedValue({
      id: "school-id",
      name: "Example School",
      slug: "example-school",
      status: "ACTIVE",
      legalName: null,
      supportEmail: null,
      phone: null,
      website: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      institutions: [],
      branches: [],
      users: [],
      _count: dependencyCounts
    });

    const school = await getSchoolByIdForAdministrator(administratorContext, "school-id");

    expect(mocks.db.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.db.tenant.findUnique.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: { id: "school-id" },
      select: expect.objectContaining({
        _count: {
          select: {
            institutions: true,
            branches: true,
            users: true,
            students: true,
            staffProfiles: true,
            studentAttendanceRecords: true,
            staffAttendanceRecords: true,
            auditLogs: true,
            notificationOutboxItems: true,
            roles: true,
            classSectionSubjects: true,
            gradebookAssessments: true,
            gradebookMarks: true
          }
        }
      })
    }));
    expect(school).toEqual(expect.objectContaining({
      id: "school-id",
      commercialAccessSchemaAvailable: true,
      subscription: null,
      dependencySummary: dependencyCounts
    }));
    expect(school).not.toHaveProperty("_count");
  });

  it("loads core school details without querying unavailable commercial tables", async () => {
    mocks.db.$queryRaw.mockResolvedValue([{
      subscriptionTableAvailable: false,
      entitlementTableAvailable: false
    }]);
    mocks.db.tenant.findUnique.mockResolvedValue({
      id: "school-id",
      name: "Example School",
      slug: "example-school",
      status: "ACTIVE",
      legalName: null,
      supportEmail: null,
      phone: null,
      website: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      institutions: [{
        id: "institution-id",
        name: "Example Institution",
        displayName: null,
        code: "MAIN",
        status: "ACTIVE",
        logoUrl: null
      }],
      branches: [],
      users: [],
      tenantSettings: null,
      _count: dependencyCounts
    });

    await expect(
      getSchoolByIdForAdministrator(administratorContext, "school-id")
    ).resolves.toMatchObject({
      id: "school-id",
      commercialAccessSchemaAvailable: false,
      subscription: null,
      institutions: [{ id: "institution-id", entitlements: [] }]
    });
    expect(mocks.db.tenantSubscription.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.institutionEntitlement.findMany).not.toHaveBeenCalled();
  });
  it("uses the same bounded relation-count query for lifecycle checks", async () => {
    mocks.db.tenant.findUnique.mockResolvedValue({ _count: dependencyCounts });

    await expect(getSchoolDependencySummary("school-id")).resolves.toEqual(dependencyCounts);
    expect(mocks.db.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it("does not hide infrastructure failures behind a permission message", () => {
    const detailPage = readFileSync(
      resolve(process.cwd(), "src/app/administrator/schools/[tenantId]/page.tsx"),
      "utf8"
    );
    const editPage = readFileSync(
      resolve(process.cwd(), "src/app/administrator/schools/[tenantId]/edit/page.tsx"),
      "utf8"
    );

    expect(detailPage).toContain("if (!(error instanceof AppError) || error.status !== 403) throw error;");
    expect(editPage).toContain("if (!(error instanceof AppError) || error.status !== 403) throw error;");
    expect(editPage).toContain("Module access setup pending");
  });
});
