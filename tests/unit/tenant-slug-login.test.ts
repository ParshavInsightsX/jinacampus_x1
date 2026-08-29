import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    staffProfile: { findFirst: vi.fn() },
    session: { create: vi.fn() },
    $transaction: vi.fn()
  },
  verifyPasswordOrDummy: vi.fn(),
  beginPasswordLoginAttempt: vi.fn(),
  completePasswordLoginAttempt: vi.fn(),
  passwordLoginSourceAddress: vi.fn(),
  createRawSessionToken: vi.fn(),
  getSessionExpiresAt: vi.fn(),
  hashSessionToken: vi.fn(),
  setSessionCookie: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/password", () => ({
  verifyPasswordOrDummy: mocks.verifyPasswordOrDummy
}));
vi.mock("@/lib/auth/password-login-throttle", () => ({
  beginPasswordLoginAttempt: mocks.beginPasswordLoginAttempt,
  completePasswordLoginAttempt: mocks.completePasswordLoginAttempt,
  passwordLoginSourceAddress: mocks.passwordLoginSourceAddress
}));
vi.mock("@/lib/auth/session", () => ({
  createRawSessionToken: mocks.createRawSessionToken,
  getSessionExpiresAt: mocks.getSessionExpiresAt,
  hashSessionToken: mocks.hashSessionToken
}));
vi.mock("@/lib/auth/cookies", () => ({ setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));

import { POST } from "@/app/api/auth/login/route";
import { AppError } from "@/lib/errors";
import { SCHOOL_LOGIN_ERROR_MESSAGE, normalizeTenantSlug, validateSchoolId } from "@/modules/campus-core/tenant-login-policy";

const tenant = {
  id: "tenant-demo-id",
  name: "JinaCampus Demo School",
  status: "ACTIVE"
};

const principalUser = {
  id: "principal-user-id",
  tenantId: tenant.id,
  email: "principal@demo.jinacampus.test",
  userType: "STAFF",
  status: "ACTIVE",
  passwordCredential: { passwordHash: "stored-hash", mustChange: false },
  roleAssignments: [{
    tenantId: tenant.id,
    role: { tenantId: tenant.id, code: "PRINCIPAL", isActive: true }
  }]
};

const teacherUser = {
  ...principalUser,
  id: "teacher-user-id",
  email: "teacher@demo.jinacampus.test",
  roleAssignments: [{
    tenantId: tenant.id,
    role: { tenantId: tenant.id, code: "TEACHER", isActive: true }
  }]
};

const staffUser = {
  ...principalUser,
  id: "staff-user-id",
  email: "staff@demo.jinacampus.test",
  roleAssignments: [{
    tenantId: tenant.id,
    role: { tenantId: tenant.id, code: "STAFF", isActive: true }
  }]
};

const platformAdministratorUser = {
  ...principalUser,
  id: "platform-administrator-user-id",
  email: "operator@jinacampus.test",
  roleAssignments: [{
    tenantId: tenant.id,
    role: { tenantId: tenant.id, code: "ADMINISTRATOR", isActive: true }
  }]
};

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function loginRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body)
  });
}

async function postLogin(body: Record<string, unknown>) {
  const response = await POST(loginRequest(body));
  return {
    status: response.status,
    body: await response.json()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.tenant.findUnique.mockResolvedValue(tenant);
  mocks.db.user.findUnique.mockResolvedValue(principalUser);
  mocks.db.user.update.mockResolvedValue({});
  mocks.db.session.create.mockResolvedValue({});
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.db) => unknown) => callback(mocks.db));
  mocks.verifyPasswordOrDummy.mockResolvedValue(true);
  mocks.beginPasswordLoginAttempt.mockResolvedValue({
    realm: "SCHOOL",
    channel: "SCHOOL_WEB",
    tenantId: tenant.id,
    accountBucketId: "account-bucket-id",
    sourceBucketId: null,
    buckets: []
  });
  mocks.completePasswordLoginAttempt.mockResolvedValue(undefined);
  mocks.passwordLoginSourceAddress.mockReturnValue(null);
  mocks.createRawSessionToken.mockReturnValue("raw-session-token");
  mocks.hashSessionToken.mockResolvedValue("hashed-session-token");
  mocks.getSessionExpiresAt.mockReturnValue(new Date("2026-06-03T00:00:00.000Z"));
  mocks.setSessionCookie.mockResolvedValue(undefined);
  mocks.writeAuditLog.mockResolvedValue(undefined);
});

describe("School ID login", () => {
  it("normalizes valid School IDs and rejects invalid or reserved School IDs", () => {
    expect(normalizeTenantSlug(" JinaCampus-Demo ")).toBe("jinacampus-demo");
    expect(normalizeTenantSlug("jinacampus_demo")).toBeNull();
    expect(normalizeTenantSlug("")).toBeNull();
    expect(validateSchoolId("administrator")).toEqual({
      ok: false,
      message: "This School ID is reserved. Please choose another."
    });
  });

  it("rejects malformed School IDs before any tenant or user lookup", async () => {
    const result = await postLogin({
      schoolId: "jinacampus_demo",
      email: "principal@demo.jinacampus.test",
      password: "candidate-password"
    });

    expect(result).toEqual({ status: 400, body: { error: SCHOOL_LOGIN_ERROR_MESSAGE } });
    expect(mocks.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|tokenHash|tenantId|role/i);
  });

  it("logs in a principal through School ID using tenantId plus email lookup", async () => {
    const result = await postLogin({
      schoolId: "jinacampus-demo",
      email: "principal@demo.jinacampus.test",
      password: "correct-password"
    });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, redirectTo: "/", passwordChangeRequired: false }
    });
    expect(mocks.db.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: "jinacampus-demo" } });
    expect(mocks.db.user.findUnique.mock.calls[0][0].where.tenantId_email).toEqual({
      tenantId: tenant.id,
      email: "principal@demo.jinacampus.test"
    });
    expect(mocks.db.session.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ tenantId: tenant.id, userId: principalUser.id, tokenHash: "hashed-session-token" })
    );
    expect(mocks.setSessionCookie).toHaveBeenCalledWith("raw-session-token", expect.any(Date));
    expect(mocks.beginPasswordLoginAttempt).toHaveBeenCalledWith(expect.objectContaining({
      realm: "SCHOOL",
      channel: "SCHOOL_WEB",
      tenantId: tenant.id,
      accountKey: principalUser.id
    }));
    expect(mocks.completePasswordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ accountBucketId: "account-bucket-id" }),
      "SUCCESS"
    );
    expect(JSON.stringify(result.body)).not.toMatch(/passwordHash|tokenHash|tenantId/);
  });

  it("returns a safe 429 response with Retry-After when the durable limiter blocks login", async () => {
    mocks.beginPasswordLoginAttempt.mockRejectedValueOnce(Object.assign(
      new AppError("PASSWORD_LOGIN_THROTTLED", "PASSWORD_LOGIN_THROTTLED", 429),
      { retryAfterSeconds: 47 }
    ));

    const response = await POST(loginRequest({
      schoolId: "jinacampus-demo",
      email: "principal@demo.jinacampus.test",
      password: "candidate-password"
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("47");
    expect(await response.json()).toEqual({
      error: "Too many sign-in attempts. Please wait and try again."
    });
    expect(mocks.verifyPasswordOrDummy).not.toHaveBeenCalled();
    expect(mocks.db.session.create).not.toHaveBeenCalled();
  });

  it("keeps legacy tenantSlug request compatibility while the UI uses School ID", async () => {
    const result = await postLogin({
      tenantSlug: "jinacampus-demo",
      email: "principal@demo.jinacampus.test",
      password: "correct-password"
    });

    expect(result.status).toBe(200);
    expect(mocks.db.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: "jinacampus-demo" } });
  });

  it("logs in a class teacher through School ID and returns the teacher landing route", async () => {
    mocks.db.user.findUnique.mockResolvedValue(teacherUser);

    const result = await postLogin({
      schoolId: "jinacampus-demo",
      email: "teacher@demo.jinacampus.test",
      password: "correct-password"
    });

    expect(result).toEqual({
      status: 200,
      body: { ok: true, redirectTo: "/", passwordChangeRequired: false }
    });
  });

  it("logs staff in with a tenant-scoped employee code and password", async () => {
    mocks.db.user.findUnique.mockResolvedValue(null);
    mocks.db.staffProfile.findFirst.mockResolvedValue({ user: staffUser });

    const result = await postLogin({
      schoolId: "jinacampus-demo",
      identifier: " staff-001 ",
      password: "correct-password"
    });

    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        redirectTo: "/",
        passwordChangeRequired: false
      }
    });
    expect(mocks.db.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: tenant.id,
        employeeCode: { equals: "STAFF-001", mode: "insensitive" },
        employmentStatus: "ACTIVE",
        userId: { not: null }
      })
    }));
  });

  it("rejects platform administrators at the school login boundary", async () => {
    mocks.db.user.findUnique.mockResolvedValue(platformAdministratorUser);

    const result = await postLogin({
      schoolId: "jinacampus-demo",
      email: platformAdministratorUser.email,
      password: "correct-password"
    });

    expect(result).toEqual({ status: 401, body: { error: SCHOOL_LOGIN_ERROR_MESSAGE } });
    expect(mocks.verifyPasswordOrDummy).toHaveBeenCalledWith("correct-password", null);
    expect(mocks.db.session.create).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toMatch(/administrator|role|tenantId/i);
  });

  it("returns the same safe error for wrong tenant, unknown email, inactive tenant, inactive user, and bad password", async () => {
    const attempts: Array<{
      tenantResult?: unknown;
      userResult?: unknown;
      passwordValid?: boolean;
    }> = [
      { tenantResult: null },
      { tenantResult: { ...tenant, id: "tenant-other-id" }, userResult: null },
      { userResult: null },
      { tenantResult: { ...tenant, status: "SUSPENDED" } },
      { userResult: { ...principalUser, status: "SUSPENDED" } },
      { passwordValid: false }
    ];

    for (const attempt of attempts) {
      vi.clearAllMocks();
      mocks.db.tenant.findUnique.mockResolvedValue("tenantResult" in attempt ? attempt.tenantResult : tenant);
      mocks.db.user.findUnique.mockResolvedValue("userResult" in attempt ? attempt.userResult : principalUser);
      mocks.verifyPasswordOrDummy.mockResolvedValue("passwordValid" in attempt ? attempt.passwordValid : true);

      const result = await postLogin({
        schoolId: "jinacampus-demo",
        email: "principal@demo.jinacampus.test",
        password: "candidate-password"
      });

      expect(result).toEqual({ status: 401, body: { error: SCHOOL_LOGIN_ERROR_MESSAGE } });
      expect(JSON.stringify(result.body)).not.toMatch(/tenant exists|email exists|role|passwordHash|tokenHash/i);
    }
  });

  it("rejects client-supplied tenant context fields", async () => {
    const result = await postLogin({
      schoolId: "jinacampus-demo",
      tenantId: "client-supplied-cross-tenant-id",
      email: "principal@demo.jinacampus.test",
      password: "correct-password"
    });

    expect(result).toEqual({ status: 400, body: { error: SCHOOL_LOGIN_ERROR_MESSAGE } });
    expect(mocks.db.tenant.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.session.create).not.toHaveBeenCalled();
  });

  it("keeps generic login blank and supports an explicit tenant route with locked School ID UI", () => {
    const loginPage = source("src/app/page.tsx");
    const compatibilityRoute = source("src/app/(auth)/login/page.tsx");
    const tenantLoginPage = source("src/app/t/[tenantSlug]/login/page.tsx");
    const loginForm = source("src/components/auth/login-form.tsx");

    expect(loginPage).toContain("schoolId={schoolId}");
    expect(loginPage).toContain("schoolIdLocked={false}");
    expect(loginPage).toContain("searchParams");
    expect(compatibilityRoute).toContain('query.set("schoolId", schoolId)');
    expect(compatibilityRoute).toContain('query.set("status", "session-expired")');
    expect(tenantLoginPage).toContain("params: Promise<{ tenantSlug: string }>");
    expect(tenantLoginPage).toContain("schoolIdLocked={true}");
    expect(loginForm).toContain('label="School ID"');
    expect(loginForm).toContain('type="hidden" name="schoolId"');
    expect(loginForm).not.toContain("JinaCampus Administrator Portal");
    expect(loginForm).not.toContain("/administrator/login");
    expect(loginForm).toContain("schoolName");
    expect(loginForm).toContain("logoUrl");
    expect(loginForm).toContain("Forgot password?");
    expect(loginForm).toContain("PasswordInput");
    expect(loginForm).not.toContain("admin@demo.jinacampus.test");
    expect(loginForm).not.toContain("sample credentials");
  });

  it("keeps administrator login separate from school login", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/administrator/login/page.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/api/auth/administrator-login/route.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/platform/login/page.tsx"))).toBe(false);
    expect(source("src/components/auth/administrator-login-form.tsx")).not.toContain("schoolId");
    expect(source("src/components/auth/administrator-login-form.tsx")).toContain('fetch("/api/auth/administrator-login"');
    expect(source("src/app/administrator/login/page.tsx")).toContain("index: false");
  });

  it("session context source resolves tenant, branch, academic year, roles, and institution branding after login", () => {
    const contextSource = source("src/lib/tenant/context.ts");

    expect(contextSource).toContain("tenantId: session.tenantId");
    expect(contextSource).toContain("activeBranchId");
    expect(contextSource).toContain("activeAcademicYearId");
    expect(contextSource).toContain("institutionDisplayName");
    expect(contextSource).toContain("institutionLogoUrl");
    expect(contextSource).toContain("roleLabels");
    expect(contextSource).toContain("roleCodes");
    expect(contextSource).not.toContain("clientTenantId");
  });
});
