import { describe, expect, it, vi } from "vitest";
import { getUserSafeErrorMessage } from "@/lib/errors";
import {
  isIdentityCardSchemaAvailable,
  requireIdentityCardSchema,
  type IdentityCardSchemaProbeClient
} from "@/lib/schema-readiness/identity-cards";

function schemaProbe(input: {
  staffPhotoTableAvailable?: boolean;
  studentCardTableAvailable?: boolean;
} = {}) {
  const queryRaw = vi.fn().mockResolvedValue([{
    staffPhotoTableAvailable: true,
    studentCardTableAvailable: true,
    ...input
  }]);
  return {
    client: { $queryRaw: queryRaw } as unknown as IdentityCardSchemaProbeClient,
    queryRaw
  };
}

describe("identity-card schema readiness", () => {
  it("reports ready only when both identity-card tables exist", async () => {
    const ready = schemaProbe();
    const missingStaffPhotos = schemaProbe({ staffPhotoTableAvailable: false });
    const missingStudentCards = schemaProbe({ studentCardTableAvailable: false });

    await expect(isIdentityCardSchemaAvailable(ready.client)).resolves.toBe(true);
    await expect(isIdentityCardSchemaAvailable(missingStaffPhotos.client)).resolves.toBe(false);
    await expect(isIdentityCardSchemaAvailable(missingStudentCards.client)).resolves.toBe(false);
    expect(ready.queryRaw).toHaveBeenCalledOnce();
  });

  it("fails closed with a safe service-unavailable error while migration is pending", async () => {
    const { client } = schemaProbe({ staffPhotoTableAvailable: false });

    await expect(requireIdentityCardSchema(client)).rejects.toMatchObject({
      code: "IDENTITY_CARD_UPGRADE_REQUIRED",
      status: 503
    });
    expect(getUserSafeErrorMessage("IDENTITY_CARD_UPGRADE_REQUIRED")).toBe(
      "Identity cards and staff photographs are temporarily unavailable while setup is completed. Please contact the JinaCampus Administrator."
    );
  });
});
