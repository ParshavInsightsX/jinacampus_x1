import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("final responsive UI and motion system", () => {
  it("defines three restrained glass levels with readable fallbacks", () => {
    const globals = source("src/app/globals.css");

    expect(globals).toContain("--jc-glass-application: rgba(255, 255, 255, 0.72)");
    expect(globals).toContain("--jc-glass-elevated: rgba(255, 255, 255, 0.86)");
    expect(globals).toContain("--jc-glass-focus: rgba(255, 255, 255, 0.94)");
    expect(globals).toContain(".jc-glass-application");
    expect(globals).toContain(".jc-glass-elevated");
    expect(globals).toContain(".jc-glass-focus");
    expect(globals).toContain("@supports not ((backdrop-filter: blur(1px))");
    expect(globals).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(globals).toContain("background: #ffffff;");
    expect(globals).not.toMatch(
      /^\s*backdrop-filter:[^\r\n]+;\r?\n\s*-webkit-backdrop-filter:/m
    );
    expect(globals).toMatch(
      /-webkit-backdrop-filter: blur\(30px\) saturate\(1\.42\);\r?\n\s+backdrop-filter: blur\(30px\) saturate\(1\.42\);/
    );
  });

  it("uses one motion scale and limits route animation to page content", () => {
    const globals = source("src/app/globals.css");
    const layout = source("src/app/(dashboard)/layout.tsx");
    const template = source("src/app/(dashboard)/template.tsx");

    expect(globals).toContain("--jc-motion-micro: 160ms");
    expect(globals).toContain("--jc-motion-standard: 220ms");
    expect(globals).toContain("--jc-motion-page: 280ms");
    expect(globals).toContain("--jc-motion-sheet: 320ms");
    expect(globals).toContain("@keyframes jc-route-content-enter");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(template).toContain('data-route-transition="content-only"');
    expect(template).toContain('className="jc-route-content"');
    expect(layout.indexOf("<AppChrome")).toBeLessThan(layout.indexOf("{children}"));
    expect(existsSync(resolve(process.cwd(), "src/app/(dashboard)/loading.tsx"))).toBe(false);
  });

  it("keeps desktop, mobile, and platform navigation stable and safe-area aware", () => {
    const navbar = source("src/components/app-shell/app-navbar.tsx");
    const desktopDock = source("src/components/app-shell/desktop-navigation-dock.tsx");
    const mobileDock = source("src/components/app-shell/mobile-bottom-nav.tsx");
    const administratorShell = source("src/modules/campus-core/components/administrator-shell.tsx");
    const combined = `${navbar}\n${desktopDock}\n${mobileDock}\n${administratorShell}`;

    expect(navbar).toContain("jc-glass-application jc-motion-shell");
    expect(desktopDock).toContain("desktop-dock-surface jc-glass-application");
    expect(mobileDock).toContain("pb-[calc(0.5rem+env(safe-area-inset-bottom))]");
    expect(mobileDock).toContain("jc-motion-interactive");
    expect(administratorShell).toContain('data-administrator-mobile-navigation="true"');
    expect(administratorShell).toContain("ctx.canManagePrincipalRecovery");
    expect(administratorShell).toContain("env(safe-area-inset-bottom)");
    expect(combined).not.toContain("transition-all");
  });

  it("keeps dense operational content opaque and print output motion-free", () => {
    const globals = source("src/app/globals.css");
    const forms = source("src/components/ui/form-primitives.tsx");
    const tables = source("src/components/ui/table-primitives.tsx");

    expect(globals).toContain(".premium-card");
    expect(globals).toContain("bg-white shadow-soft");
    expect(globals).toContain("@media print");
    expect(globals).toContain("animation: none !important;");
    expect(forms).toContain('role="alert"');
    expect(forms).toContain("rounded-lg");
    expect(tables).toContain('data-responsive-table="true"');
    expect(tables).not.toContain("motion-soft-hover inline-flex whitespace-nowrap");
  });
});
