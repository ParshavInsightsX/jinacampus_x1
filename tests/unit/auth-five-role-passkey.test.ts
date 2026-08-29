import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-with-at-least-32-characters"
  }
}));

import {
  canAssignRole,
  hasPlatformAdminRole,
  hasSchoolLoginRole,
  OPERATIONAL_ROLE_CODES,
  SCHOOL_OPERATIONAL_ROLE_CODES
} from "@/lib/rbac/roles";
import { activeRoleCodes, type LoginUser } from "@/lib/auth/login-identity";
import { isWebAuthnRpIdAllowed } from "@/lib/auth/webauthn-config";
import {
  passkeyAuthenticationOptionsSchema,
  passkeyAuthenticationVerifySchema,
  passkeyDeleteSchema
} from "@/modules/campus-core/passkey-auth.schemas";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("five-role and passkey authentication foundation", () => {
  it("defines five operational roles and keeps platform administration operator-only", () => {
    expect(OPERATIONAL_ROLE_CODES).toEqual([
      "ADMINISTRATOR",
      "PRINCIPAL",
      "OFFICE_STAFF",
      "TEACHER",
      "STAFF"
    ]);
    expect(SCHOOL_OPERATIONAL_ROLE_CODES).toEqual([
      "PRINCIPAL",
      "OFFICE_STAFF",
      "TEACHER",
      "STAFF"
    ]);
    expect(hasPlatformAdminRole(["ADMINISTRATOR"])).toBe(true);
    expect(hasPlatformAdminRole(["SUPER_ADMIN", "ADMIN"])).toBe(false);
    expect(hasSchoolLoginRole(["TEACHER"])).toBe(true);
    expect(hasSchoolLoginRole(["ADMIN"])).toBe(true);
    expect(hasSchoolLoginRole(["ADMINISTRATOR"])).toBe(false);
    expect(hasSchoolLoginRole(["ADMINISTRATOR", "PRINCIPAL"])).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "ADMINISTRATOR")).toBe(false);
    expect(canAssignRole(["PRINCIPAL"], "TEACHER")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["TEACHER"], "STAFF")).toBe(false);
  });

  it("rejects tenant, user, role, and credential ownership claims from passkey clients", () => {
    expect(passkeyAuthenticationOptionsSchema.safeParse({
      tenantSlug: "school-a",
      identifier: "STAFF-001",
      tenantId: "client-tenant"
    }).success).toBe(false);
    expect(passkeyAuthenticationVerifySchema.safeParse({
      tenantSlug: "school-a",
      challenge: "a".repeat(32),
      response: {
        id: "credential",
        rawId: "credential",
        type: "public-key",
        response: {},
        clientExtensionResults: {}
      },
      userId: "client-user"
    }).success).toBe(false);
    expect(passkeyDeleteSchema.safeParse({
      credentialId: "00000000-0000-0000-0000-000000000001",
      currentPassword: "candidate-password",
      role: "ADMINISTRATOR"
    }).success).toBe(false);
  });

  it("accepts only tenant-consistent login roles and an RP ID related to the origin", () => {
    const user = {
      tenantId: "tenant-a",
      roleAssignments: [
        {
          tenantId: "tenant-a",
          startsAt: null,
          endsAt: null,
          role: { tenantId: "tenant-a", code: "TEACHER", isActive: true }
        },
        {
          tenantId: "tenant-b",
          startsAt: null,
          endsAt: null,
          role: { tenantId: "tenant-b", code: "ADMINISTRATOR", isActive: true }
        }
      ]
    } as unknown as LoginUser;

    expect(activeRoleCodes(user)).toEqual(["TEACHER"]);
    expect(isWebAuthnRpIdAllowed("login.jinacampus.example", "jinacampus.example")).toBe(true);
    expect(isWebAuthnRpIdAllowed("login.jinacampus.example", "unrelated.example")).toBe(false);
    expect(isWebAuthnRpIdAllowed("login.jinacampus.example", "https://jinacampus.example")).toBe(false);
  });

  it("persists hashed identity metadata and one-time tenant-scoped challenges", () => {
    const service = source("src/modules/campus-core/passkey-auth.service.ts");
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260729173000_add_passkey_authentication/migration.sql");

    expect(service).toContain('createHmac("sha256", env.SESSION_SECRET)');
    expect(service).toContain("tenantId: input.tenantId");
    expect(service).toContain("consumedAt: null");
    expect(service).toContain("expiresAt: { gt: new Date() }");
    expect(service).toContain("claimed.count !== 1");
    expect(service).toContain("verification.authenticationInfo.newCounter");
    expect(service).toContain("requireUserVerification: true");
    expect(service).not.toMatch(/biometric|fingerprintTemplate|faceTemplate/i);
    expect(schema).toContain("model PasskeyCredential");
    expect(schema).toContain("credentialId String");
    expect(schema).toContain("publicKey");
    expect(schema).toContain("counter");
    expect(migration).toContain('UNIQUE INDEX "passkey_credentials_credentialId_key"');
    expect(migration).not.toContain("rawToken");
  });

  it("keeps password fallback, forced password change, and passkey enrollment verification", () => {
    const login = source("src/components/auth/login-form.tsx");
    const loginRoute = source("src/app/api/auth/login/route.ts");
    const requireAuth = source("src/lib/auth/require-auth.ts");
    const tenantContext = source("src/lib/tenant/context.ts");
    const mobileAuth = source("src/lib/mobile-api/auth.ts");
    const manager = source("src/modules/campus-core/components/passkey-manager.tsx");

    expect(login).toContain("Employee code or email");
    expect(login).toContain("Sign in with passkey");
    expect(login).toContain('name="signInMethod"');
    expect(login).toContain('method === "password"');
    expect(login).toContain('password: formData.get("password")');
    expect(loginRoute).toContain("findLoginUser");
    expect(loginRoute).toContain("passwordChangeRequired");
    expect(requireAuth).toContain('redirect("/account/change-password?required=1")');
    expect(tenantContext).toContain("allowPasswordChangeRequired");
    expect(tenantContext).toContain('throw new Error("PASSWORD_CHANGE_REQUIRED")');
    expect(mobileAuth).toContain('new AppError("PASSWORD_CHANGE_REQUIRED"');
    expect(manager).toContain("currentPassword");
    expect(manager).toContain("/api/auth/passkey/registration/options");
    expect(manager).toContain("/api/auth/passkey/registration/verify");
  });

  it("keeps platform operators out of school password and passkey entry points", () => {
    const passwordRoute = source("src/app/api/auth/login/route.ts");
    const passkeyService = source("src/modules/campus-core/passkey-auth.service.ts");
    const dashboardLayout = source("src/app/(dashboard)/layout.tsx");
    const platformLoginRoute = source("src/app/api/auth/administrator-login/route.ts");

    expect(passwordRoute).toContain("hasSchoolLoginRole");
    expect(passkeyService).toContain("hasSchoolLoginRole");
    expect(dashboardLayout).not.toContain("administrator");
    expect(platformLoginRoute).toContain("db.platformAdministrator.findUnique");
    expect(platformLoginRoute).not.toContain("db.user");
  });

  it("does not expose the retired phone-OTP login routes", () => {
    expect(() => source("src/app/api/auth/otp/request/route.ts")).toThrow();
    expect(() => source("src/app/api/auth/otp/verify/route.ts")).toThrow();
    expect(source("src/app/api/auth/forgot/request/route.ts")).toContain(
      "requestPasswordRecoveryService"
    );
    expect(() => source("src/app/api/auth/forgot/reset/route.ts")).toThrow();
  });

  it("limits teacher student views to server-derived assigned class sections", () => {
    const studentQueries = source("src/modules/academia/queries/student.queries.ts");
    const attendanceQueries = source("src/modules/academia/queries/student-attendance.queries.ts");

    expect(studentQueries).toContain("isAssignedTeacherScope");
    expect(studentQueries).toContain("classTeacherUserId: ctx.userId");
    expect(studentQueries).toContain("academicYearId");
    expect(attendanceQueries).toContain("classTeacherUserId: ctx.userId");
  });
});
