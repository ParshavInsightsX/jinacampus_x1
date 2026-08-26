import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("StaffBoard Lite supervised QR scanner UI", () => {
  it("protects the scanner route with the operator permission", () => {
    const path = "src/app/(dashboard)/staffboard/attendance/scan/page.tsx";
    const route = source(path);

    expect(existsSync(resolve(process.cwd(), path))).toBe(true);
    expect(route).toContain("requireAuth");
    expect(route).toContain('permissions.has("staffboard.attendance.scan")');
    expect(route).toContain("StaffAttendanceOperatorScanner");
    expect(route).toContain("Staff cannot scan their own attendance");
    expect(route).not.toContain("StaffQrScanForm");
  });

  it("starts a supervised branch session and keeps manual entry available", () => {
    const operator = source("src/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner.tsx");

    expect(operator).toContain("startStaffAttendanceScanSessionAction");
    expect(operator).toContain("closeStaffAttendanceScanSessionAction");
    expect(operator).toContain("recordSupervisedStaffQrScanAction");
    expect(operator).toContain("StaffQrCameraScanner");
    expect(operator).toContain("StaffQrManualTokenInput");
    expect(operator).toContain("submissionLock.current");
    expect(operator).toContain("crypto.randomUUID()");
    expect(operator).toContain("Scan Next Staff Member");
    expect(operator).toContain("Attendance was not recorded");
  });

  it("implements resilient iOS, Android, and PWA camera behavior", () => {
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanner).toContain('import jsQR from "jsqr"');
    expect(scanner).toContain("CAMERA_REQUEST_TIMEOUT_MS = 12_000");
    expect(scanner).toContain("getUserMediaWithTimeout");
    expect(scanner).toContain("preferredCameraConstraints");
    expect(scanner).toContain("FALLBACK_CAMERA_CONSTRAINTS");
    expect(scanner).toContain("window.isSecureContext");
    expect(scanner).toContain("navigator.mediaDevices");
    expect(scanner).toContain("videoElement.play()");
    expect(scanner).toContain("decodeQrFromCanvas");
    expect(scanner).toContain("jsQR(imageData.data");
    expect(scanner).toContain("window.requestAnimationFrame(scanVideoFrame)");
    expect(scanner).toContain("playsInline");
    expect(scanner).toContain("webkit-playsinline");
    expect(scanner).toContain('data-qr-scan-frame="true"');
    expect(scanner).toContain("aspect-square");
    expect(scanner).toContain("Upload QR image/photo");
    expect(scanner).toContain("videoTrack.applyConstraints");
    expect(scanner).not.toMatch(/html5-qrcode|qr-scanner|@zxing|BarcodeDetector/);
  });

  it("stops every camera track across scanner and page lifecycle changes", () => {
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanner).toContain("stream?.getTracks().forEach((track) => track.stop())");
    expect(scanner).toContain("window.cancelAnimationFrame(animationFrameRef.current)");
    expect(scanner).toContain('window.addEventListener("pagehide", stopForPageLifecycle)');
    expect(scanner).toContain('document.addEventListener("visibilitychange", stopWhenHidden)');
    expect(scanner).toContain("videoElement.srcObject = null");
  });

  it("shows safe actionable camera failure states", () => {
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanner).toContain("Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link.");
    expect(scanner).toContain("Camera permission was denied. Please allow camera access in Safari settings and retry.");
    expect(scanner).toContain("No camera was found on this device. Please use manual token entry.");
    expect(scanner).toContain("Camera is already in use or blocked by the device/browser.");
    expect(scanner).toContain("Camera permission request timed out.");
    expect(scanner).toContain("This looks like an in-app browser.");
    expect(scanner).toContain("Unknown camera error.");
  });

  it("enforces session, tenant, branch, duplicate, expiry, and audit checks on the server", () => {
    const service = source("src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts");

    expect(service).toContain('permission: "staffboard.attendance.scan"');
    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("operatorUserId: ctx.userId");
    expect(service).toContain("hashStaffAttendanceCredential(rawToken)");
    expect(service).toContain("credential.expiresAt <= now");
    expect(service).toContain("STAFF_ATTENDANCE_WRONG_BRANCH");
    expect(service).toContain("tenantId_clientRequestId");
    expect(service).toContain("STAFF_ATTENDANCE_SCAN_TOO_SOON");
    expect(service).toContain("STAFF_ATTENDANCE_EVENT_RECORDED");
    expect(service).toContain("STAFF_ATTENDANCE_TRANSACTION_OPTIONS");
  });

  it("does not persist or render raw scanner payloads in client storage", () => {
    const operator = source("src/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner.tsx");
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(`${operator}\n${scanner}`).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.log/i);
    expect(`${operator}\n${scanner}`).not.toMatch(/tokenHash|passwordHash|tenantId=.*payload/i);
  });

  it("keeps the own-attendance page read-only and bounded", () => {
    const query = source("src/modules/staffboard-lite/queries/staff-attendance.queries.ts");
    const page = source("src/app/(dashboard)/staffboard/attendance/me/page.tsx");

    expect(query).toContain("listMyStaffAttendanceHistory");
    expect(query).toContain("tenantId: ctx.tenantId");
    expect(query).toContain("userId: ctx.userId");
    expect(query).toContain('permission: "staffboard.attendance.self_view"');
    expect(query).toContain("take: Math.min(Math.max(limit, 1), 31)");
    expect(page).toContain('id="attendance-history"');
    expect(page).toContain("Open My Staff Card");
    expect(page).not.toContain("StaffQrCameraScanner");
  });

  it("sets a camera permissions policy for web and installed PWA routes", () => {
    const config = source("next.config.ts");

    expect(config).toContain("Permissions-Policy");
    expect(config).toContain("camera=(self), microphone=()");
  });
});