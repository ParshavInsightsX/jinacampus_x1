import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";

const mocks = vi.hoisted(() => ({
  getPlatformAdministratorContext: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/platform-administrator-session", () => ({
  getPlatformAdministratorContext: mocks.getPlatformAdministratorContext,
  isPlatformAdministratorPasswordChangeRequiredError: (error: unknown) => (
    error instanceof Error && error.message === "PLATFORM_PASSWORD_CHANGE_REQUIRED"
  )
}));

import {
  requireAdministratorContext,
  requireAdministratorContextForPasswordChange
} from "@/modules/campus-core/administrator-auth";

const platformContext = {
  administratorId: "platform-administrator-id",
  sessionId: "platform-session-id",
  email: "operator@example.test",
  displayName: "Platform Operator",
  canManagePrincipalRecovery: false,
  passwordChangeRequired: false
} satisfies PlatformAdministratorContext;

describe("Administrator Portal authorization guard", () => {
  beforeEach(() => {
    mocks.getPlatformAdministratorContext.mockReset();
    mocks.redirect.mockClear();
  });

  it("allows an authenticated independent platform administrator", async () => {
    mocks.getPlatformAdministratorContext.mockResolvedValue(platformContext);

    await expect(requireAdministratorContext()).resolves.toBe(platformContext);
    expect(mocks.getPlatformAdministratorContext).toHaveBeenCalledWith();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not consult tenant context or school roles", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/campus-core/administrator-auth.ts"),
      "utf8"
    );

    expect(source).toContain("getPlatformAdministratorContext");
    expect(source).not.toContain("getTenantContext");
    expect(source).not.toContain("hasPlatformAdminRole");
  });

  it("preserves the platform-specific forced-password-change redirect", async () => {
    mocks.getPlatformAdministratorContext.mockRejectedValue(
      new Error("PLATFORM_PASSWORD_CHANGE_REQUIRED")
    );

    await expect(requireAdministratorContext()).rejects.toThrow(
      "REDIRECT:/administrator/account/change-password?required=1"
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/administrator/account/change-password?required=1"
    );
  });

  it("allows the platform password-change route to load during mustChange", async () => {
    const requiredContext = { ...platformContext, passwordChangeRequired: true };
    mocks.getPlatformAdministratorContext.mockResolvedValue(requiredContext);

    await expect(requireAdministratorContextForPasswordChange()).resolves.toBe(requiredContext);
    expect(mocks.getPlatformAdministratorContext).toHaveBeenCalledWith({
      allowPasswordChangeRequired: true
    });
  });

  it("sends unauthenticated requests to administrator login", async () => {
    mocks.getPlatformAdministratorContext.mockRejectedValue(
      new Error("PLATFORM_UNAUTHENTICATED")
    );

    await expect(requireAdministratorContext()).rejects.toThrow(
      "REDIRECT:/administrator/login"
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/administrator/login");
  });
});
