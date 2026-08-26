import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import { recordSupervisedStaffQrScanSchema } from "@/modules/staffboard-lite/schemas";
import { scanStaffAttendanceQr } from "@/modules/staffboard-lite/services/staff-qr.service";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

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

describe("supervised staff QR scan service", () => {
  it("rejects client-provided authority and scope fields", () => {
    expect(recordSupervisedStaffQrScanSchema.safeParse({
      sessionId: "00000000-0000-0000-0000-000000000005",
      qrPayload: "opaque-card-payload",
      clientRequestId: "00000000-0000-4000-8000-000000000006",
      tenantId: ctx.tenantId,
      branchId: ctx.activeBranchId,
      userId: ctx.userId,
      role: "PRINCIPAL",
      attendanceStatus: "PRESENT"
    }).success).toBe(false);
  });

  it("enforces operator permission, tenant, institution, branch, credential, and idempotency scope server-side", () => {
    const scanner = source("src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts");

    expect(scanner).toContain('permission: "staffboard.attendance.scan"');
    expect(scanner).toContain("tenantId: ctx.tenantId");
    expect(scanner).toContain("branchId: session.branchId");
    expect(scanner).toContain("where: { tenantId: ctx.tenantId, tokenHash }");
    expect(scanner).toContain("credential.institutionId !== session.institutionId");
    expect(scanner).toContain("STAFF_ATTENDANCE_WRONG_BRANCH");
    expect(scanner).toContain("tenantId_clientRequestId");
    expect(scanner).toContain("STAFF_ATTENDANCE_SCAN_TOO_SOON");
    expect(scanner).toContain("session.institutionId");
    expect(scanner).toContain('eventSource: "SUPERVISED_STATIC_QR"');
  });

  it("keeps raw payloads out of attendance and audit records", () => {
    const scanner = source("src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts");
    const auditBlock = scanner.slice(scanner.indexOf("STAFF_ATTENDANCE_EVENT_RECORDED"));

    expect(scanner).toContain("hashStaffAttendanceCredential(rawToken)");
    expect(scanner).not.toContain("qrPayload,");
    expect(auditBlock).not.toMatch(/rawToken|tokenHash|qrPayload/);
  });

  it("rejects the legacy self-scan entry point before database work", async () => {
    await expect(scanStaffAttendanceQr(ctx, { token: "opaque-card-payload" })).rejects.toMatchObject({
      code: "STAFF_SELF_SCAN_DISABLED",
      status: 403
    });
  });
});