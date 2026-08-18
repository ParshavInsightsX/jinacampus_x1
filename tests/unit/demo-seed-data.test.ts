import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  getCommercialBootstrapConfig,
  seedCommercialBootstrap
} from "../../prisma/seeds/bootstrap-commercial.seed";
import { assertDevDemoSeedAllowed, seedDevDemo } from "../../prisma/seeds/dev-demo.seed";
import { getAssignableDemoPhone } from "../../prisma/seeds/demo-data.seed";

const requiredEnvironment = {
  COMMERCIAL_BOOTSTRAP_ENABLED: "true",
  SEED_TENANT_NAME: "North Valley School",
  SEED_TENANT_SLUG: "north-valley",
  SEED_ADMIN_EMAIL: "Owner@NorthValley.example",
  SEED_ADMIN_TEMP_PASSWORD: "StrongTemp@123"
};

function createDatabaseMock() {
  const tx = {
    tenant: { upsert: vi.fn().mockResolvedValue({ id: "tenant-1" }) },
    tenantSettings: { upsert: vi.fn().mockResolvedValue({ id: "settings-1" }) },
    role: {
      upsert: vi.fn().mockImplementation(({ create }: { create: { code: string } }) => ({ id: `role-${create.code}` })),
      findUnique: vi.fn().mockResolvedValue({ id: "role-PRINCIPAL" })
    },
    permission: { findUnique: vi.fn().mockResolvedValue({ id: "permission-1" }) },
    rolePermission: { upsert: vi.fn().mockResolvedValue({ id: "role-permission-1" }) },
    institution: { upsert: vi.fn().mockResolvedValue({ id: "institution-1" }) },
    branch: { upsert: vi.fn().mockResolvedValue({ id: "branch-1" }) },
    attendanceSetting: { upsert: vi.fn().mockResolvedValue({ id: "attendance-setting-1" }) },
    academicYear: { upsert: vi.fn().mockResolvedValue({ id: "academic-year-1" }) },
    user: { upsert: vi.fn().mockResolvedValue({ id: "user-1" }) },
    passwordCredential: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: "credential-1" })
    },
    userRoleAssignment: { upsert: vi.fn().mockResolvedValue({ id: "assignment-1" }) },
    userBranchAccess: { upsert: vi.fn().mockResolvedValue({ id: "access-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) }
  };
  const db = {
    $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
  };
  return { db: db as unknown as PrismaClient, tx };
}

describe("commercial seed safety", () => {
  it("keeps the normal seed permissions-only when commercial and dev modes are disabled", async () => {
    const seedSource = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
    const { db } = createDatabaseMock();

    await expect(seedCommercialBootstrap(db, {})).resolves.toEqual({ enabled: false });
    await expect(seedDevDemo(db, {})).resolves.toEqual({ enabled: false });
    expect(seedSource).toContain("seedPermissions(db)");
    expect(seedSource).toContain("seedCommercialBootstrap(db)");
    expect(seedSource).toContain("seedDevDemo(db)");
    expect(seedSource).not.toContain("seedDemoTenant(db)");
  });

  it("rejects development fixtures in production", () => {
    expect(() => assertDevDemoSeedAllowed({
      NODE_ENV: "production",
      DEV_DEMO_SEED_ENABLED: "true"
    })).toThrow("DEV_DEMO_SEED_ENABLED cannot be true when NODE_ENV=production.");
  });

  it("does not move a configured demo phone between user accounts", () => {
    expect(getAssignableDemoPhone("+919876543210", "target-user", "target-user"))
      .toBe("+919876543210");
    expect(getAssignableDemoPhone("+919876543210", "target-user", null))
      .toBe("+919876543210");
    expect(getAssignableDemoPhone("+919876543210", "target-user", "another-user"))
      .toBeNull();
    expect(getAssignableDemoPhone("+919876543210", null, "another-user"))
      .toBeNull();
  });

  it("keeps synthetic Principal identities distinct and reuses the seeded administrator profile", () => {
    const seedSource = readFileSync(join(process.cwd(), "prisma/seeds/demo-tenant.seed.ts"), "utf8");

    expect(seedSource).toContain('employeeCode: "JD-ADM-001"');
    expect(seedSource).toContain('user.key === "admin" ? "DEMO-PRINCIPAL-ADMIN" : "DEMO-PRINCIPAL-001"');
    expect(seedSource).toContain("principalId: demoPrincipalId(demoUser)");
  });

  it("requires commercial tenant and administrator environment values", () => {
    expect(() => getCommercialBootstrapConfig({ COMMERCIAL_BOOTSTRAP_ENABLED: "true" }))
      .toThrow("SEED_TENANT_NAME is required");
    expect(() => getCommercialBootstrapConfig({
      COMMERCIAL_BOOTSTRAP_ENABLED: "true",
      SEED_TENANT_NAME: "North Valley School"
    })).toThrow("SEED_TENANT_SLUG is required");
  });

  it("normalizes commercial School ID and administrator email without changing the password", () => {
    const config = getCommercialBootstrapConfig({
      ...requiredEnvironment,
      SEED_TENANT_SLUG: " North-Valley ",
      SEED_ADMIN_TEMP_PASSWORD: "CaseSensitive@123"
    });

    expect(config).toMatchObject({
      tenantSlug: "north-valley",
      adminEmail: "owner@northvalley.example",
      adminTemporaryPassword: "CaseSensitive@123"
    });
  });

  it("creates an idempotent school principal with a hashed temporary password and mustChange", async () => {
    const { db, tx } = createDatabaseMock();
    const passwordHasher = vi.fn().mockResolvedValue("hashed-temporary-password");

    await seedCommercialBootstrap(db, requiredEnvironment, passwordHasher);

    expect(passwordHasher).toHaveBeenCalledWith("StrongTemp@123");
    expect(tx.user.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_email: { tenantId: "tenant-1", email: "owner@northvalley.example" } }
    }));
    expect(tx.passwordCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ passwordHash: "hashed-temporary-password", mustChange: true })
    }));
    expect(tx.userRoleAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ roleId: "role-PRINCIPAL", scopeType: "TENANT" })
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: null,
        action: "tenant.commercial_bootstrap",
        metadataJson: expect.objectContaining({ source: "commercial_bootstrap" })
      })
    });
    expect(JSON.stringify(tx.passwordCredential.upsert.mock.calls)).not.toContain("StrongTemp@123");
  });

  it("does not duplicate tenant/user or reset an existing password on repeated seed", async () => {
    const { db, tx } = createDatabaseMock();
    tx.passwordCredential.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "credential-1" });
    const passwordHasher = vi.fn().mockResolvedValue("hashed-temporary-password");

    await seedCommercialBootstrap(db, requiredEnvironment, passwordHasher);
    await seedCommercialBootstrap(db, requiredEnvironment, passwordHasher);

    expect(tx.tenant.upsert).toHaveBeenCalledTimes(2);
    expect(tx.user.upsert).toHaveBeenCalledTimes(2);
    expect(tx.passwordCredential.upsert).toHaveBeenCalledTimes(1);
    expect(passwordHasher).toHaveBeenCalledTimes(1);
  });

  it("keeps login fields empty and removes committed production-facing credentials", () => {
    const loginSource = readFileSync(join(process.cwd(), "src/components/auth/login-form.tsx"), "utf8");
    const loginPageSource = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    const compatibilityRouteSource = readFileSync(join(process.cwd(), "src/app/(auth)/login/page.tsx"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(loginSource).toContain('useState(schoolId ?? "")');
    expect(loginSource).toContain('useState("")');
    expect(loginSource).toContain('formData.get("password")');
    expect(loginSource).not.toMatch(/demo login|sample credentials|changeme@123/i);
    expect(loginPageSource).toContain("schoolId={schoolId}");
    expect(loginPageSource).toContain("schoolIdLocked={false}");
    expect(loginPageSource).toContain("searchParams");
    expect(compatibilityRouteSource).toContain('redirect(schoolId ? `/?schoolId=');
    expect(`${envExample}\n${readme}`).not.toMatch(/parshavinsights@gmail\.com|JinaCampus@123|ChangeMe@123/);
    expect(envExample).not.toMatch(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/);
  });
});
