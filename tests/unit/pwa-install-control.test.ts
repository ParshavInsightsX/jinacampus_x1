import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("authenticated PWA installation control", () => {
  it("keeps a valid standalone manifest and mobile application metadata", () => {
    const manifest = JSON.parse(readProjectFile("public/site.webmanifest")) as {
      name: string;
      start_url: string;
      display: string;
      icons: Array<{ sizes: string }>;
    };
    const layout = readProjectFile("src/app/layout.tsx");

    expect(manifest.name).toContain("JinaCampus");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
    expect(layout).toContain('manifest: "/site.webmanifest"');
    expect(layout).toContain("appleWebApp");
  });

  it("uses the browser install prompt only from the install button and provides iOS guidance", () => {
    const source = readProjectFile("src/components/pwa/pwa-install-control.tsx");

    expect(source).toContain('window.addEventListener("beforeinstallprompt"');
    expect(source).toContain("await installPrompt.prompt()");
    expect(source).toContain('onClick={() => void handleInstall()}');
    expect(source).toContain("Install from Safari");
    expect(source).toContain("Add to Home Screen");
    expect(source).toContain("Open as Web App");
    expect(source).toContain('window.addEventListener("appinstalled"');
    expect(source).toContain("min-h-11");
    expect(source).not.toMatch(/serviceWorker|tokenHash|tenantId|permissionCodes/i);
  });

  it("exposes the install control from the authenticated mobile navigation drawer", () => {
    const drawer = readProjectFile("src/components/app-shell/mobile-navigation-drawer.tsx");
    const navbar = readProjectFile("src/components/app-shell/app-navbar.tsx");

    expect(drawer).toContain("PwaInstallControl");
    expect(drawer).toContain("<PwaInstallControl />");
    expect(navbar).toContain("PwaInstallProvider");
    expect(navbar).toContain("<PwaInstallProvider>");
  });
});
