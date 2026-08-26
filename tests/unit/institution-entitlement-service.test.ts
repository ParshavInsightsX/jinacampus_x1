import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    branch: { findFirst: vi.fn() },
    institution: { findFirst: vi.fn() },
    tenantSubscription: { findUnique: vi.fn() },
    institutionEntitlement: { findMany: vi.fn() }
  }
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlement } from "@/modules/campus-core/entitlements/service";

const tenantId = "00000000-0000-0000-0000-000000000001";
const institutionId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const ctx = { tenantId, institutionId };

function activeSubscription() {
  return {
    status: "ACTIVE" as const,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    graceEndsAt: null
  };
}

beforeEach(() => {
  mocks.db.$queryRaw.mockReset();
  mocks.db.branch.findFirst.mockReset();
  mocks.db.institution.findFirst.mockReset();
  mocks.db.tenantSubscription.findUnique.mockReset();
  mocks.db.institutionEntitlement.findMany.mockReset();
  mocks.db.$queryRaw.mockResolvedValue([{
    subscriptionTableAvailable: true,
    entitlementTableAvailable: true
  }]);
  mocks.db.branch.findFirst.mockResolvedValue({ institutionId });
  mocks.db.tenantSubscription.findUnique.mockResolvedValue(activeSubscription());
  mocks.db.institutionEntitlement.findMany.mockResolvedValue([
    { featureKey: "module", access: "FULL", startsAt: null, endsAt: null },
    { featureKey: "reports", access: "READ_ONLY", startsAt: null, endsAt: null }
  ]);
});

describe("institution entitlement service", () => {
  it("resolves branch and entitlement rows inside the authenticated tenant", async () => {
    await expect(requireAttendanceEntitlement(
      ctx,
      ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
      "READ",
      { branchId }
    )).resolves.toMatchObject({ institutionId, subscriptionActive: true });

    expect(mocks.db.branch.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: branchId, tenantId })
    }));
    expect(mocks.db.institutionEntitlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, institutionId, moduleKey: "attendance" }
    }));
  });

  it("blocks writes to a view-only capability", async () => {
    await expect(requireAttendanceEntitlement(
      ctx,
      ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
      "WRITE",
      { branchId }
    )).rejects.toMatchObject({ code: "MODULE_READ_ONLY", status: 403 });
  });

  it("blocks access when the subscription is suspended", async () => {
    mocks.db.tenantSubscription.findUnique.mockResolvedValue({
      ...activeSubscription(),
      status: "SUSPENDED"
    });

    await expect(requireAttendanceEntitlement(
      ctx,
      ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
      "READ",
      { branchId }
    )).rejects.toMatchObject({ code: "SUBSCRIPTION_INACTIVE", status: 403 });
  });

    it("fails closed without querying missing entitlement tables", async () => {
    mocks.db.$queryRaw.mockResolvedValue([{
      subscriptionTableAvailable: false,
      entitlementTableAvailable: false
    }]);

    await expect(requireAttendanceEntitlement(
      ctx,
      ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
      "READ",
      { branchId }
    )).rejects.toMatchObject({ code: "ENTITLEMENT_CONFIGURATION_REQUIRED", status: 503 });
    expect(mocks.db.tenantSubscription.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.institutionEntitlement.findMany).not.toHaveBeenCalled();
  });
it("does not resolve a branch outside the current tenant", async () => {
    mocks.db.branch.findFirst.mockResolvedValue(null);

    await expect(requireAttendanceEntitlement(
      ctx,
      ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
      "READ",
      { branchId }
    )).rejects.toMatchObject({ code: "ENTITLEMENT_SCOPE_NOT_FOUND", status: 404 });
    expect(mocks.db.tenantSubscription.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.institutionEntitlement.findMany).not.toHaveBeenCalled();
  });
});