import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("JinaCampus brand and UI redesign", () => {
  it("uses one central brand configuration and supplied logo variants", () => {
    const brand = source("src/config/brand.ts");
    const logo = source("src/components/brand/brand-logo.tsx");
    const mark = source("src/components/brand/app-mark.tsx");

    expect(brand).toContain('name: "JinaCampus"');
    expect(brand).toContain('tagline: "The Complete School OS"');
    expect(brand).toContain('poweredBy: "powered by Parshwa Insights"');
    expect(brand).toContain("jinacampus-logo-primary-transparent.png");
    expect(brand).toContain("jinacampus-logo-inverse-dark.png");
    expect(logo).toContain("next/image");
    expect(mark).toContain("next/image");

    for (const asset of [
      "public/brand/jinacampus-logo-primary-transparent.png",
      "public/brand/jinacampus-logo-primary-light.png",
      "public/brand/jinacampus-logo-inverse-dark.png",
      "public/brand/jinacampus-mark-transparent.png",
      "public/brand/jinacampus-app-icon-master.png",
      "public/brand/jinacampus-auth-campus-background.png"
    ]) {
      expect(existsSync(resolve(process.cwd(), asset))).toBe(true);
    }
  });

  it("makes the root route auth-aware and keeps login as a compatibility redirect", () => {
    const root = source("src/app/page.tsx");
    const compatibilityLogin = source("src/app/(auth)/login/page.tsx");
    const logout = source("src/app/api/auth/logout/route.ts");

    expect(root).toContain("getTenantContext({ allowPasswordChangeRequired: true })");
    expect(root).toContain("getPostLoginRedirectPath");
    expect(root).toContain("<LoginForm");
    expect(root).toContain('<AuthShell variant="school">');
    expect(root).not.toContain("HeroSection");
    expect(compatibilityLogin).toContain("redirect(");
    expect(compatibilityLogin).toContain('"/"');
    expect(logout).toContain('new URL("/", request.url)');
  });

  it("defines semantic design tokens, restrained motion, and brand typography", () => {
    const globals = source("src/app/globals.css");
    const tailwind = source("tailwind.config.ts");
    const layout = source("src/app/layout.tsx");

    for (const token of [
      "--jc-color-app-bg",
      "--jc-color-primary",
      "--jc-color-secondary",
      "--jc-color-accent",
      "--jc-color-text",
      "--jc-color-border",
      "--jc-color-focus",
      "--jc-color-success",
      "--jc-color-warning",
      "--jc-color-error"
    ]) {
      expect(globals).toContain(token);
    }
    expect(globals).toContain("prefers-reduced-motion");
    expect(globals).not.toContain("radial-gradient");
    expect(tailwind).toContain('"app-background": "#f6f8ff"');
    expect(tailwind).toContain('"2xl": "0.5rem"');
    expect(layout).toContain("Manrope");
    expect(layout).toContain("Nunito_Sans");
  });

  it("keeps the responsive shell permission- and feature-aware", () => {
    const navigation = source("src/components/app-shell/navigation.ts");
    const desktop = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const navbar = source("src/components/app-shell/app-navbar.tsx");
    const mobile = source("src/components/app-shell/mobile-bottom-nav.tsx");
    const dashboardLayout = source("src/app/(dashboard)/layout.tsx");

    expect(desktop).toContain('data-desktop-navigation-dock="true"');
    expect(desktop).toContain("backdrop-blur-2xl");
    expect(navbar).toContain("<BrandLogo");
    expect(dashboardLayout).not.toContain("DesktopShell");
    expect(dashboardLayout).toContain("getMobileBottomNavigationItems(");
    expect(dashboardLayout).toContain("{ gradebookEnabled }");
    expect(mobile).toContain("items: readonly MobileBottomNavItem[]");
    expect(mobile).toContain('aria-label="Mobile primary navigation"');
    expect(navigation).toContain("PermissionCode");
    expect(navigation).toContain('title: "GradeBook"');
    expect(navigation).not.toMatch(/FeeDesk|SchoolCast|InsightBoard/);
  });

  it("uses the new PWA identity without exposing authentication internals", () => {
    const manifest = source("public/site.webmanifest");
    const authUi = [
      source("src/components/auth/login-form.tsx"),
      source("src/components/auth/forgot-password-form.tsx"),
      source("src/components/auth/administrator-login-form.tsx")
    ].join("\n");

    expect(manifest).toContain('"theme_color": "#0B1638"');
    expect(manifest).toContain('"background_color": "#F6F8FF"');
    expect(manifest).toContain('"start_url": "/"');
    expect(manifest).toContain('"purpose": "any maskable"');
    expect(authUi).not.toMatch(/passwordHash|tokenHash|rawToken|sessionSecret/);
  });
});
