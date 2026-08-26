import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctStaffAttendanceAction } from "@/modules/staffboard-lite/actions/staff-attendance.actions";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => ({ getTenantContext: vi.fn() }));

vi.mock("@/lib/tenant/context", () => ({ getTenantContext: mocks.getTenantContext }));

const branchId = "00000000-0000-0000-0000-000000000003";
const attendanceRecordId = "00000000-0000-0000-0000-000000000005";
const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
};

beforeEach(() => {
  mocks.getTenantContext.mockReset();
  mocks.getTenantContext.mockResolvedValue(ctx);
});

describe("StaffBoard Lite legacy attendance correction action", () => {
  it("fails closed and directs valid legacy submissions to maker-checker approval", async () => {
    const result = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved office correction"
    });

    expect(result).toEqual({
      ok: false,
      code: "ATTENDANCE_CORRECTION_APPROVAL_REQUIRED",
      error: "Submit an attendance correction request for approval."
    });
    expect(mocks.getTenantContext).toHaveBeenCalledOnce();
  });

  it("rejects client-supplied tenant, branch, actor, and staff fields before authentication", async () => {
    const result = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved office correction",
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId,
      actorUserId: "00000000-0000-0000-0000-000000000098",
      staffId: "00000000-0000-0000-0000-000000000006"
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
  });

  it("rejects client-supplied permission hints before authentication", async () => {
    const result = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved office correction",
      permission: "staffboard.attendance.correct",
      permissions: ["staffboard.attendance.view"]
    });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
  });

  it("validates the reason and attendance time order before authentication", async () => {
    const blankReason = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "   "
    });
    const reversedTimes = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved office correction",
      checkInAt: "2026-05-05T11:00:00.000Z",
      checkOutAt: "2026-05-05T10:00:00.000Z"
    });

    expect(blankReason).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(reversedTimes).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
  });

  it("never echoes client-supplied QR secrets", async () => {
    const result = await correctStaffAttendanceAction({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved office correction",
      tokenHash: "server-only-token-hash",
      rawToken: "server-only-raw-token"
    });

    expect(JSON.stringify(result)).not.toContain("server-only-token-hash");
    expect(JSON.stringify(result)).not.toContain("server-only-raw-token");
  });
});