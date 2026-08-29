import { describe, expect, it } from "vitest";
import { isUsableTenantBranchAccess } from "@/lib/tenant/branch-access";

const tenantId = "tenant-a";

function access(overrides: {
  accessTenantId?: string;
  branchTenantId?: string;
  branchStatus?: string;
  institutionStatus?: string;
} = {}) {
  return {
    tenantId: overrides.accessTenantId ?? tenantId,
    branch: {
      tenantId: overrides.branchTenantId ?? tenantId,
      status: overrides.branchStatus ?? "ACTIVE",
      institution: {
        status: overrides.institutionStatus ?? "ACTIVE"
      }
    }
  };
}

describe("tenant branch context eligibility", () => {
  it("accepts an active branch in an active institution for the current tenant", () => {
    expect(isUsableTenantBranchAccess(access(), tenantId)).toBe(true);
  });

  it.each([
    ["cross-tenant access", { accessTenantId: "tenant-b" }],
    ["cross-tenant branch", { branchTenantId: "tenant-b" }],
    ["inactive branch", { branchStatus: "INACTIVE" }],
    ["inactive institution", { institutionStatus: "INACTIVE" }]
  ])("rejects %s", (_label, overrides) => {
    expect(isUsableTenantBranchAccess(access(overrides), tenantId)).toBe(false);
  });
});
