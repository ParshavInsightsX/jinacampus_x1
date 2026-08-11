import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractStaffQrToken,
  formatStaffAttendanceStatus,
  formatStaffQrPurpose,
  parseStaffAttendanceQrPayload,
  staffQrScanErrorMessage,
  staffQrScanErrorTitle
} from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-state";

describe("StaffBoard Lite QR scan UI", () => {
  it("creates the scan route and wires it to the scan form", () => {
    const routePath = resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/scan/page.tsx");
    const routeSource = readFileSync(routePath, "utf8");

    expect(existsSync(routePath)).toBe(true);
    expect(routeSource).toContain("StaffQrScanForm");
    expect(routeSource).toContain("StaffQrScanHelpCard");
    expect(routeSource).toContain("staffboard.attendance.self_scan");
  });

  it("renders camera scanner and keeps manual token fallback", () => {
    const formSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx"),
      "utf8"
    );
    const scannerSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx"),
      "utf8"
    );
    const inputSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-manual-token-input.tsx"),
      "utf8"
    );

    expect(formSource).toContain("StaffQrCameraScanner");
    expect(scannerSource).toContain("Start Camera");
    expect(scannerSource).toContain('import jsQR from "jsqr"');
    expect(scannerSource).toContain("navigator.mediaDevices");
    expect(scannerSource).toContain("mediaDevices?.getUserMedia");
    expect(scannerSource).toContain("Camera scanning requires HTTPS");
    expect(scannerSource).toContain("window.isSecureContext");
    expect(scannerSource).toContain("getCameraDiagnostics");
    expect(scannerSource).toContain("logCameraDiagnostics");
    expect(scannerSource).toContain("Checking camera support...");
    expect(scannerSource).toContain("CAMERA_REQUEST_TIMEOUT_MS = 12_000");
    expect(scannerSource).toContain("getUserMediaWithTimeout");
    expect(scannerSource).toContain("requestCameraStream(mediaDevices, deviceId)");
    expect(scannerSource).toContain("mediaDevices.getUserMedia(constraints)");
    expect(scannerSource).toContain("preferredCameraConstraints");
    expect(scannerSource).toContain("FALLBACK_CAMERA_CONSTRAINTS");
    expect(scannerSource).toContain("videoElement.play()");
    expect(scannerSource).toContain("decodeQrFromCanvas");
    expect(scannerSource).toContain("jsQR(imageData.data");
    expect(scannerSource).toContain("window.requestAnimationFrame(scanVideoFrame)");
    expect(scannerSource).toContain("playsInline");
    expect(scannerSource).toContain("webkit-playsinline");
    expect(scannerSource).toContain("decodeUploadedImage");
    expect(scannerSource).toContain("Upload QR image/photo");
    expect(scannerSource).toContain("Upload QR image for attendance scan");
    expect(scannerSource).toContain('data-camera-diagnostics="true"');
    expect(scannerSource).toContain('data-camera-https-warning="true"');
    expect(scannerSource).toContain('data-camera-inapp-warning="true"');
    expect(scannerSource).toContain('data-qr-scan-frame="true"');
    expect(scannerSource).toContain("aspect-square");
    expect(scannerSource).toContain("cropToSquare");
    expect(scannerSource).toContain("SwitchCamera");
    expect(scannerSource).toContain("Flashlight");
    expect(scannerSource).toContain("videoTrack.applyConstraints");
    expect(formSource).toContain("StaffQrManualTokenInput");
    expect(inputSource).toContain("QR token or scanned QR payload");
    expect(`${formSource}\n${scannerSource}\n${inputSource}`).not.toMatch(/html5-qrcode|qr-scanner|@zxing|BarcodeDetector/);
  });

  it("does not persist camera or manual raw tokens or expose QR internals in scan UI source", () => {
    const formSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx"),
      "utf8"
    );
    const scannerSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx"),
      "utf8"
    );
    const resultSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-result.tsx"),
      "utf8"
    );

    expect(formSource).toContain("setTokenInput(\"\")");
    expect(scannerSource).toContain("window.cancelAnimationFrame(animationFrameRef.current)");
    expect(scannerSource).toContain('window.addEventListener("pagehide", stopForPageLifecycle)');
    expect(scannerSource).toContain('document.addEventListener("visibilitychange", stopWhenHidden)');
    expect(scannerSource).toContain("stream?.getTracks().forEach((track) => track.stop())");
    expect(scannerSource).toContain("videoElement.srcObject = null");
    expect(`${formSource}\n${scannerSource}\n${resultSource}`).not.toMatch(/localStorage|sessionStorage|indexedDB|cookie|console\.log/i);
    expect(`${formSource}\n${scannerSource}\n${resultSource}`).not.toMatch(/tokenHash|rawToken|tenantId|branchId=.*secret/i);
  });

  it("extracts raw token from manual text or QR payload JSON", () => {
    expect(extractStaffQrToken(" raw-staff-qr-token-12345 ")).toBe("raw-staff-qr-token-12345");
    expect(extractStaffQrToken("{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\" raw-token-from-payload \"}")).toBe(
      "raw-token-from-payload"
    );
    expect(extractStaffQrToken(" ")).toBe("");
  });

  it("parses scanner payloads safely without leaking malformed QR details", () => {
    expect(parseStaffAttendanceQrPayload(" raw-staff-qr-token-12345 ")).toEqual({
      ok: true,
      token: "raw-staff-qr-token-12345"
    });
    expect(parseStaffAttendanceQrPayload("{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\" raw-token-from-payload \"}")).toEqual({
      ok: true,
      token: "raw-token-from-payload"
    });
    expect(parseStaffAttendanceQrPayload(" ")).toEqual({
      ok: false,
      error: "QR payload is empty. Scan the staff attendance QR or use manual token entry."
    });
    expect(parseStaffAttendanceQrPayload("{bad-json")).toMatchObject({
      ok: false,
      error: "This QR code could not be read. Use the current staff attendance QR."
    });
    expect(parseStaffAttendanceQrPayload("{\"type\":\"OTHER_QR\",\"token\":\"raw-token\"}")).toMatchObject({
      ok: false,
      error: "This QR code is not a valid staff attendance QR."
    });
  });

  it("wires decoded camera tokens to the existing scan action path", () => {
    const formSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx"),
      "utf8"
    );
    const scannerSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx"),
      "utf8"
    );

    expect(formSource).toContain("onQrPayloadDetected={submitRawQrPayload}");
    expect(formSource).toContain("scanStaffAttendanceQrAction({ qrPayload })");
    expect(scannerSource).toContain("onQrPayloadDetected(qrPayload)");
    expect(scannerSource).not.toContain("parseStaffAttendanceQrPayload");
  });

  it("locks duplicate submissions and redirects successful scans without putting the QR payload in the URL", () => {
    const formSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-form.tsx"),
      "utf8"
    );

    expect(formSource).toContain("submissionLockRef.current");
    expect(formSource).toContain('data-qr-processing-lock={isPending ? "locked" : "ready"}');
    expect(formSource).toContain("router.replace(`/staffboard/attendance/me?scan=success&purpose=${purpose}`)");
    expect(formSource).not.toMatch(/router\.(?:push|replace)\([^\n]*qrPayload/);
  });

  it("renders safe camera unsupported and permission denied messages", () => {
    const scannerSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx"),
      "utf8"
    );

    expect(scannerSource).toContain("Camera is not available in this browser context. Use the approved HTTPS link in Safari/Chrome.");
    expect(scannerSource).toContain("No camera was found on this device. Please use manual token entry.");
    expect(scannerSource).toContain("Camera permission was denied. Please allow camera access in Safari settings and retry.");
    expect(scannerSource).toContain("Camera requires a secure HTTPS connection. Please open the approved HTTPS pilot link.");
    expect(scannerSource).toContain("Camera is already in use or blocked by the device/browser.");
    expect(scannerSource).toContain("Camera permission request timed out.");
    expect(scannerSource).toContain("This looks like an in-app browser.");
    expect(scannerSource).toContain("Unknown camera error.");
  });

  it("sets a camera permissions policy for web and PWA scanner routes", () => {
    const configSource = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(configSource).toContain("Permissions-Policy");
    expect(configSource).toContain("camera=(self), microphone=()");
  });

  it("formats success result labels", () => {
    expect(formatStaffQrPurpose("CHECK_IN")).toBe("Check-in");
    expect(formatStaffQrPurpose("CHECK_OUT")).toBe("Check-out");
    expect(formatStaffAttendanceStatus("HALF_DAY")).toBe("Half Day");
  });

  it("maps expired and invalid QR errors to safe staff-facing messages", () => {
    expect(staffQrScanErrorMessage("STAFF_QR_EXPIRED", "raw error")).toContain("expired");
    expect(staffQrScanErrorMessage("INVALID_STAFF_QR", "raw error")).toContain("invalid");
    expect(staffQrScanErrorMessage("STAFF_QR_BRANCH_MISMATCH", "raw error")).toContain("different branch");
    expect(staffQrScanErrorMessage("FORBIDDEN", "raw error")).toContain("permission");
    expect(staffQrScanErrorMessage("FORBIDDEN_PERMISSION:staffboard.attendance.self_scan", "raw error")).toContain(
      "permission"
    );
    expect(staffQrScanErrorMessage("STAFF_ALREADY_CHECKED_IN", "raw tokenHash tenantId")).not.toMatch(/tokenHash|tenantId/);
    expect(staffQrScanErrorTitle("STAFF_QR_EXPIRED")).toBe("QR code expired");
    expect(staffQrScanErrorTitle("STAFF_ALREADY_CHECKED_OUT")).toBe("Attendance already recorded");
  });

  it("shows success result fields including check-in and check-out data", () => {
    const resultSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-qr-scan-result.tsx"),
      "utf8"
    );

    expect(resultSource).toContain("Attendance date");
    expect(resultSource).toContain("Staff member");
    expect(resultSource).toContain("Institution");
    expect(resultSource).toContain("Branch");
    expect(resultSource).toContain("Recorded at");
    expect(resultSource).toContain("Check-in");
    expect(resultSource).toContain("Check-out");
    expect(resultSource).toContain("Working minutes");
  });

  it("loads only the authenticated staff member's bounded attendance history", () => {
    const querySource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/queries/staff-attendance.queries.ts"),
      "utf8"
    );
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/me/page.tsx"),
      "utf8"
    );

    expect(querySource).toContain("listMyStaffAttendanceHistory");
    expect(querySource).toContain("tenantId: ctx.tenantId");
    expect(querySource).toContain("userId: ctx.userId");
    expect(querySource).toContain('permission: "staffboard.attendance.self_view"');
    expect(querySource).toContain("take: Math.min(Math.max(limit, 1), 31)");
    expect(pageSource).toContain('id="attendance-history"');
    expect(pageSource).toContain("StaffQrScanResult");
  });
});
