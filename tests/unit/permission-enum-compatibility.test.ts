import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PermissionModule } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isPermissionCode } from "@/lib/rbac/permissions";

describe("disabled KinBridge compatibility release", () => {
  it("generates a client that can decode the existing permission module", () => {
    expect(PermissionModule.KINBRIDGE).toBe("KINBRIDGE");
  });

  it("does not activate KinBridge routes or permissions", () => {
    for (const path of [
      "src/app/kinbridge",
      "src/app/api/kinbridge",
      "src/app/(dashboard)/campus-core/kinbridge",
      "src/modules/kinbridge"
    ]) expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    expect(isPermissionCode("kinbridge.account.manage")).toBe(false);
  });

  it("keeps migration and seed commands out of installation and builds", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts.postinstall).toBe("prisma generate");
    expect(pkg.scripts.build).toBe("prisma generate && next build");
    expect(pkg.scripts.prebuild).toBeUndefined();
  });
});
