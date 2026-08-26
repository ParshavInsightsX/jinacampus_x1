import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schemaAvailable: vi.fn()
}));

vi.mock("@/modules/campus-core/entitlements/service", () => ({
  isInstitutionEntitlementSchemaAvailable: mocks.schemaAvailable
}));

import { INSTITUTION_ENTITLEMENT_DEFINITIONS } from "@/modules/campus-core/entitlements/catalog";
import { initializeInstitutionCommercialAccess } from "@/modules/campus-core/entitlements/provisioning";

function transactionMock() {
  return {
    tenantSubscription: { upsert: vi.fn() },
    institutionEntitlement: { createMany: vi.fn() }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("institution commercial-access provisioning", () => {
  it("defers commercial initialization without failing school creation before migration", async () => {
    const tx = transactionMock();
    mocks.schemaAvailable.mockResolvedValue(false);

    await expect(initializeInstitutionCommercialAccess(tx as never, {
      tenantId: "00000000-0000-0000-0000-000000000001",
      institutionId: "00000000-0000-0000-0000-000000000002"
    })).resolves.toEqual({ schemaAvailable: false });

    expect(tx.tenantSubscription.upsert).not.toHaveBeenCalled();
    expect(tx.institutionEntitlement.createMany).not.toHaveBeenCalled();
  });

  it("creates subscription and code-defined entitlement defaults after migration", async () => {
    const tx = transactionMock();
    mocks.schemaAvailable.mockResolvedValue(true);

    await expect(initializeInstitutionCommercialAccess(tx as never, {
      tenantId: "00000000-0000-0000-0000-000000000001",
      institutionId: "00000000-0000-0000-0000-000000000002",
      planCode: "GROWTH"
    })).resolves.toEqual({ schemaAvailable: true });

    expect(tx.tenantSubscription.upsert).toHaveBeenCalledOnce();
    expect(tx.institutionEntitlement.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ moduleKey: "attendance", featureKey: "module", access: "FULL" }),
        expect.objectContaining({ moduleKey: "gradebook", featureKey: "module", access: "DISABLED" })
      ]),
      skipDuplicates: true
    }));
    expect(tx.institutionEntitlement.createMany.mock.calls[0][0].data).toHaveLength(
      INSTITUTION_ENTITLEMENT_DEFINITIONS.length
    );
  });
});