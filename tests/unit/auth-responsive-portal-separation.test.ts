import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("responsive auth workflow and portal separation", () => {
  it("renders one selected school sign-in method while preserving both secure flows", () => {
    const login = source("src/components/auth/login-form.tsx");

    expect(login).toContain('type SignInMethod = "passkey" | "password"');
    expect(login).toContain('attendanceIntent ? "passkey" : "password"');
    expect(login).toContain('name="signInMethod"');
    expect(login).toContain('method === "password"');
    expect(login).toContain('fetch("/api/auth/login"');
    expect(login).toContain('fetch("/api/auth/passkey/authentication/options"');
    expect(login).toContain('fetch("/api/auth/passkey/authentication/verify"');
  });

  it("preserves exact password handling and normalizes only school and account identifiers", () => {
    const login = source("src/components/auth/login-form.tsx");

    expect(login).toContain('password: formData.get("password")');
    expect(login).toContain("normalizeSchoolCodeForSubmit");
    expect(login).toContain("normalizeIdentifier");
    expect(login).not.toMatch(/password[^\n]*(toLowerCase|toUpperCase|\.trim\()/);
  });

  it("provides single-scroll short-landscape containment, safe areas, touch targets, and accessibility fallbacks", () => {
    const globals = source("src/app/globals.css");

    expect(globals).toContain("@media (orientation: landscape) and (max-width: 1023px) and (max-height: 620px)");
    expect(globals).toContain("overflow: clip");
    expect(globals).not.toContain("max-height: calc(100dvh - 1rem)");
    expect(globals).not.toContain("overscroll-behavior: contain");
    expect(globals).toContain("min-height: 2.75rem");
    expect(globals).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(globals).toContain("@media (prefers-reduced-transparency: reduce)");
  });

  it("lets the root metadata template append the JinaCampus brand exactly once", () => {
    const administratorPage = source("src/app/administrator/login/page.tsx");
    const principalResetPage = source("src/app/(auth)/principal-password-reset/page.tsx");

    expect(administratorPage).toContain('title: "Administrator Sign In"');
    expect(administratorPage).not.toContain("Administrator Sign In | JinaCampus");
    expect(principalResetPage).toContain('title: "Principal Password Reset"');
    expect(principalResetPage).not.toContain("Principal Password Reset | JinaCampus");
  });

  it("does not expose the Administrator entry point through school-facing UI", () => {
    const login = source("src/components/auth/login-form.tsx");
    const administrator = source("src/components/auth/administrator-login-form.tsx");

    expect(login).not.toContain("/administrator/login");
    expect(login).not.toContain("Administrator Portal");
    expect(administrator).toContain("/api/auth/administrator-login");
    expect(administrator).toContain("Platform Portal");
  });
});
