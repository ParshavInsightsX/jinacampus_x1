import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Base MVP UI/UX modernization", () => {
  it("defines the approved brand palette and reusable operational surface utilities", () => {
    const tailwind = source("tailwind.config.ts");
    const globals = source("src/app/globals.css");

    expect(tailwind).toContain("#0b1638");
    expect(tailwind).toContain("#2457e6");
    expect(tailwind).toContain("#12b8a6");
    expect(tailwind).toContain("#c8a44d");
    expect(tailwind).toContain("boxShadow");
    expect(tailwind).toContain("app-glass");
    expect(globals).toContain("premium-glass-panel");
    expect(globals).toContain("premium-card");
    expect(globals).toContain("premium-section-shell");
    expect(globals).toContain("premium-filter-bar");
    expect(globals).toContain("premium-muted-chip");
    expect(globals).toContain("premium-primary-button");
    expect(globals).toContain("premium-secondary-button");
    expect(globals).toContain("--jc-color-app-bg");
    expect(globals).toContain("rounded-lg");
  });

  it("modernizes the authenticated app shell without adding unapproved navigation", () => {
    const shell = [
      source("src/app/layout.tsx"),
      source("src/app/(dashboard)/layout.tsx"),
      source("src/components/app-shell/app-navbar.tsx"),
      source("src/components/app-shell/navbar-context-menu.tsx"),
      source("src/components/app-shell/desktop-navigation-dock.tsx"),
      source("src/components/app-shell/mobile-navigation-drawer.tsx"),
      source("src/components/app-shell/navigation.ts")
    ].join("\n");
    const manifest = JSON.parse(source("public/site.webmanifest")) as {
      icons: Array<{ src: string; purpose?: string }>;
    };

    expect(shell).toContain("bg-sidebar");
    expect(shell).toContain("<BrandLogo");
    expect(shell).toContain("Current workspace");
    expect(shell).toContain("data-mobile-navigation");
    expect(shell).toContain("data-desktop-navigation-dock");
    expect(shell).toContain("premium-nav-scroll");
    expect(shell).toContain('manifest: "/site.webmanifest"');
    expect(shell).toContain('/favicon.ico');
    expect(shell).toContain('/apple-touch-icon.png');
    expect(manifest.icons.map((icon) => icon.src)).toEqual(
      expect.arrayContaining([
        "/icons/icon-192x192.png",
        "/icons/icon-512x512.png",
        "/icons/icon-1024x1024.png"
      ])
    );
    expect(shell).toContain("GradeBook");
    expect(shell).toContain("SchoolCast");
    expect(shell).toContain("schoolCastEnabled");
    expect(shell).not.toMatch(/FeeDesk|payroll|biometric/i);
  });

  it("keeps auth screens premium, accessible, and password-safe", () => {
    const auth = [
      source("src/app/(auth)/login/page.tsx"),
      source("src/app/(auth)/forgot-password/page.tsx"),
      source("src/components/auth/login-form.tsx"),
      source("src/components/auth/forgot-password-form.tsx"),
      source("src/components/forms/password-input.tsx")
    ].join("\n");

    expect(auth).toContain("auth-form-panel");
    expect(auth).toContain("auth-action-primary");
    expect(auth).toContain("Forgot password?");
    expect(auth).toContain("aria-label={label}");
    expect(auth).toContain('type="button"');
    expect(auth).not.toMatch(/passwordHash|resetToken|tokenHash|rawToken/i);
  });

  it("keeps tables, states, and dashboard components responsive and safe", () => {
    const combined = [
      source("src/components/ui/table-primitives.tsx"),
      source("src/components/ui/empty-state.tsx"),
      source("src/modules/dashboard/components/dashboard-page-header.tsx"),
      source("src/modules/dashboard/components/dashboard-metric-card.tsx"),
      source("src/modules/dashboard/components/dashboard-quick-actions.tsx")
    ].join("\n");

    expect(combined).toContain('data-responsive-table="true"');
    expect(combined).toContain("Scroll sideways to view all columns.");
    expect(combined).toContain("rounded-lg");
    expect(combined).toContain("premium-card");
    expect(combined).toContain("statusDotClassNames");
    expect(combined).toContain("dashboard-glass-panel");
    expect(combined).not.toContain("bg-gradient-to-r");
    expect(combined).not.toMatch(/passwordHash|tokenHash|rawToken|Prisma error/i);
  });

  it("does not use a dashboard route-group loading fallback for first-paint customer demo routes", () => {
    expect(existsSync(resolve(process.cwd(), "src/app/(dashboard)/loading.tsx"))).toBe(false);
  });

  it("applies the modernized treatment to attendance and QR surfaces", () => {
    const attendance = [
      source("src/modules/academia/components/attendance/attendance-mark-form.tsx"),
      source("src/modules/academia/components/attendance/attendance-student-table.tsx"),
      source("src/modules/staffboard-lite/components/attendance/staff-qr-display.tsx"),
      source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx"),
      source("src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx"),
      source("src/modules/staffboard-lite/components/attendance/staff-attendance-summary-cards.tsx")
    ].join("\n");

    expect(attendance).toContain("premium-card");
    expect(attendance).toContain("premium-primary-button");
    expect(attendance).toContain("premium-secondary-button");
    expect(attendance).toContain("rounded-2xl");
    expect(attendance).not.toMatch(/tokenHash|rawToken|passwordHash/i);
  });

  it("aligns the native mobile shell to the same premium glass direction without sensitive output", () => {
    const nativeSource = [
      source("apps/mobile/src/lib/theme.ts"),
      source("apps/mobile/src/components/ui.tsx"),
      source("apps/mobile/app/login.tsx"),
      source("apps/mobile/app/(app)/home.tsx"),
      source("apps/mobile/src/features/staff-attendance/staff-qr-scanner.tsx"),
      source("apps/mobile/src/features/teacher-attendance/teacher-attendance-shell.tsx")
    ].join("\n");

    expect(nativeSource).toContain("#4f46e5");
    expect(nativeSource).toContain("#06b6d4");
    expect(nativeSource).toContain("surfaceGlass");
    expect(nativeSource).toContain("boxShadow");
    expect(nativeSource).toContain("PasswordField");
    expect(nativeSource).toContain("StatusBadge");
    expect(nativeSource).toContain("ActionTile");
    expect(nativeSource).not.toMatch(/passwordHash|tokenHash|rawToken|AsyncStorage|console\./i);
  });
});
