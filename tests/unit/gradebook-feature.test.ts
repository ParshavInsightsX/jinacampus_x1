import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  db: {
    tenantSettings: {
      findUnique: mocks.findUnique
    }
  }
}));

import { getGradebookFeatureState } from "@/modules/gradebook/feature";

const tenantId = "00000000-0000-0000-0000-000000000001";

describe("GradeBook feature rollout", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
  });

  it("maps deployed feature settings", async () => {
    mocks.findUnique.mockResolvedValue({
      gradebookEnabled: true,
      gradebookConfigurationEnabled: true,
      gradebookMarksEntryEnabled: true,
      gradebookImportEnabled: false,
      gradebookResultCalculationEnabled: false,
      gradebookCoScholasticEnabled: false,
      gradebookReportCardsEnabled: false,
      gradebookPublicationEnabled: false,
      gradebookAnalyticsEnabled: false,
      gradebookPortalResultsEnabled: false
    });

    await expect(getGradebookFeatureState({ tenantId })).resolves.toMatchObject({
      enabled: true,
      configuration: true,
      marksEntry: true,
      import: false
    });
  });

  it("fails closed while the additive GradeBook feature migration is pending", async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ gradebookEnabled: true })
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
        "The selected GradeBook feature column does not exist",
        {
          code: "P2022",
          clientVersion: "5.22.0",
          meta: { column: "tenant_settings.gradebookConfigurationEnabled" }
        }
      ));

    await expect(getGradebookFeatureState({ tenantId })).resolves.toEqual({
      enabled: false,
      configuration: false,
      marksEntry: false,
      import: false,
      resultCalculation: false,
      coScholastic: false,
      reportCards: false,
      publication: false,
      analytics: false,
      portalResults: false
    });
  });

  it("does not hide unrelated database failures", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unrelated column is missing", {
      code: "P2022",
      clientVersion: "5.22.0",
      meta: { column: "tenant_settings.unrelatedColumn" }
    });
    mocks.findUnique.mockResolvedValueOnce({ gradebookEnabled: true }).mockRejectedValueOnce(error);

    await expect(getGradebookFeatureState({ tenantId })).rejects.toBe(error);
  });

  it("does not query undeployed subfeature columns when GradeBook is disabled", async () => {
    mocks.findUnique.mockResolvedValueOnce({ gradebookEnabled: false });

    await expect(getGradebookFeatureState({ tenantId })).resolves.toEqual({
      enabled: false,
      configuration: false,
      marksEntry: false,
      import: false,
      resultCalculation: false,
      coScholastic: false,
      reportCards: false,
      publication: false,
      analytics: false,
      portalResults: false
    });
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });
});
