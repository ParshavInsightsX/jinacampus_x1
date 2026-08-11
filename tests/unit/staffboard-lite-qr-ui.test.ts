import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatPurpose,
  formatQrStatus,
  formatValidityDuration,
  getQrDisplayStatus,
  getSecondsRemaining,
  isQrExpired,
  STAFF_QR_PURPOSE_OPTIONS
} from "@/modules/staffboard-lite/components/attendance/staff-qr-display-state";

describe("StaffBoard Lite QR display UI", () => {
  it("keeps the QR purpose selector limited to check-in and check-out", () => {
    expect(STAFF_QR_PURPOSE_OPTIONS).toEqual([
      { value: "CHECK_IN", label: "Check-in" },
      { value: "CHECK_OUT", label: "Check-out" }
    ]);
    expect(STAFF_QR_PURPOSE_OPTIONS.map((option) => option.value)).not.toContain("NOT_MARKED");
  });

  it("handles active and expired countdown state", () => {
    const now = new Date("2026-05-05T04:30:00.000Z");

    expect(getSecondsRemaining("2026-05-05T04:32:05.000Z", now)).toBe(125);
    expect(formatCountdown(125)).toBe("00:02:05");
    expect(formatCountdown(18_000)).toBe("05:00:00");
    expect(isQrExpired("2026-05-05T04:29:59.000Z", now)).toBe(true);
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(getQrDisplayStatus("ACTIVE", "2026-05-05T04:29:59.000Z", now)).toBe("EXPIRED");
    expect(getQrDisplayStatus("DEACTIVATED", "2026-05-05T04:32:05.000Z", now)).toBe("DEACTIVATED");
  });

  it("formats QR purpose labels for display", () => {
    expect(formatPurpose("CHECK_IN")).toBe("Check-in");
    expect(formatPurpose("CHECK_OUT")).toBe("Check-out");
    expect(formatQrStatus("ACTIVE")).toBe("Active");
    expect(formatValidityDuration(18_000)).toBe("5 hours");
  });

  it("wires the QR route to the display component", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/qr/page.tsx"),
      "utf8"
    );

    expect(routeSource).toContain("StaffQrDisplay");
    expect(routeSource).toContain("listStaffQrBranchOptions");
    expect(routeSource).toContain("PermissionState");
    expect(routeSource).not.toContain("FORBIDDEN_STAFF_QR_ATTENDANCE_ACCESS");
    expect(routeSource).not.toContain("StaffboardComingSoon");
  });

  it("renders QR payload through qrcode.react without exposing tokenHash text", () => {
    const displaySource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-display.tsx"),
      "utf8"
    );
    const countdownSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-countdown.tsx"),
      "utf8"
    );

    expect(displaySource).toContain("QRCodeSVG");
    expect(displaySource).toContain("qr.qrPayload");
    expect(displaySource).toContain("Deactivate");
    expect(countdownSource).toContain("Remaining validity");
    expect(displaySource).not.toContain("tokenHash");
    expect(displaySource).not.toContain("tenantId");
    expect(displaySource).not.toContain("createdById");
    expect(displaySource).not.toContain("rawToken");
  });
});
