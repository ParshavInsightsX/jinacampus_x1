import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("StaffBoard Lite staff QR card UI", () => {
  it("retires the shared QR display route in favor of managed and personal cards", () => {
    const route = source("src/app/(dashboard)/staffboard/attendance/qr/page.tsx");

    expect(route).toContain("requireAuth");
    expect(route).toContain('staffboard.attendance.credential.manage');
    expect(route).toContain('staffboard.attendance.credential.self_view');
    expect(route).toContain('redirect("/staffboard/attendance/credentials")');
    expect(route).toContain('redirect("/staffboard/attendance/card")');
    expect(route).not.toContain("StaffQrDisplay");
  });

  it("renders a professional two-sided institution-branded Staff ID card", () => {
    const card = source("src/modules/staffboard-lite/components/attendance/staff-identity-card.tsx");

    expect(card).toContain("Staff Identification Card");
    expect(card).toContain("institutionLogoUrl");
    expect(card).toContain("photoUrl");
    expect(card).toContain("Employee Code");
    expect(card).toContain("Designation");
    expect(card).toContain("Department");
    expect(card).toContain("Authorised Signatory");
    expect(card).toContain("Supervised Staff Attendance");
    expect(card).toContain("QRCodeSVG");
    expect(card).toContain("level=\"H\"");
    expect(card).toContain("non-transferable");
    expect(card).toContain("INR 500");
    expect(card).not.toMatch(/tokenHash|rawToken|password|credential secret/i);
  });

  it("gives staff a purpose-specific Attendance QR view with no print or download action", () => {
    const page = source("src/app/(dashboard)/staffboard/attendance/card/page.tsx");
    const presentation = source("src/modules/staffboard-lite/components/attendance/staff-attendance-qr-presentation.tsx");

    expect(page).toContain("getMyStaffAttendanceCredentialCard");
    expect(page).toContain("StaffAttendanceQrPresentation");
    expect(page).not.toContain("StaffIdentityCard");
    expect(presentation).toContain("QRCodeSVG");
    expect(presentation).toContain("Ready for check-in");
    expect(presentation).toContain("Ready for check-out");
    expect(presentation).not.toMatch(/window\.print|recordStaffAttendanceCredentialPrintAction|download=/);
  });

  it("audits manager printing before opening the browser print dialog", () => {
    const manager = source("src/modules/staffboard-lite/components/attendance/staff-attendance-credential-manager.tsx");

    expect(manager).toContain("recordStaffAttendanceCredentialPrintAction");
    expect(manager).toContain("identity-card-print-area");
    expect(manager).toContain('<StaffIdentityCard card={card} mode="manager" />');
    expect(manager.indexOf("recordStaffAttendanceCredentialPrintAction")).toBeLessThan(manager.indexOf("window.print()"));
    expect(manager).not.toContain("download=");
  });

  it("uses print CSS that excludes application chrome and preserves physical card dimensions", () => {
    const css = source("src/app/globals.css");

    expect(css).toContain("@media print");
    expect(css).toContain("body *");
    expect(css).toContain("visibility: hidden !important");
    expect(css).toContain(".identity-card-print-area");
    expect(css).toContain("width: 85.6mm");
    expect(css).toContain("height: 53.98mm");
    expect(css).toContain("break-after: page");
    expect(css).toContain(".identity-card-digital-only");
  });
});
