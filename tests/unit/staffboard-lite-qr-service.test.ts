import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import {
  deactivateStaffAttendanceQrToken,
  generateStaffAttendanceQrToken,
  hashStaffAttendanceQrToken,
  scanStaffAttendanceQr
} from "@/modules/staffboard-lite/services/staff-qr.service";

const ctx = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "staff@example.test",
  userType: "STAFF",
  activeBranchId: "00000000-0000-0000-0000-000000000003",
  accessibleBranchIds: ["00000000-0000-0000-0000-000000000003"],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004",
  roleCodes: ["STAFF"]
} satisfies TenantContext;

describe("retired shared and self-scan QR service", () => {
  it("retains deterministic hashing for historical token compatibility", () => {
    const rawToken = "historical-attendance-token";
    expect(hashStaffAttendanceQrToken(rawToken)).toBe(
      createHash("sha256").update(rawToken).digest("hex")
    );
    expect(hashStaffAttendanceQrToken(rawToken)).not.toBe(rawToken);
  });

  it("fails closed for shared QR generation and deactivation", async () => {
    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).rejects.toMatchObject({
      code: "STAFF_SHARED_QR_RETIRED",
      status: 410
    });
    await expect(deactivateStaffAttendanceQrToken(ctx, {
      qrTokenId: "00000000-0000-0000-0000-000000000005"
    })).rejects.toMatchObject({
      code: "STAFF_SHARED_QR_RETIRED",
      status: 410
    });
  });

  it("fails closed for staff self-scan regardless of payload", async () => {
    await expect(scanStaffAttendanceQr(ctx, { token: "raw-token" })).rejects.toMatchObject({
      code: "STAFF_SELF_SCAN_DISABLED",
      status: 403
    });
  });
});