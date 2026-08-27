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

  it("starts a continuous supervised branch session and keeps recovery fallback available", () => {
    const operator = source("src/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner.tsx");

    expect(operator).toContain("startStaffAttendanceScanSessionAction");
    expect(operator).toContain("closeStaffAttendanceScanSessionAction");
    expect(operator).toContain("recordSupervisedStaffQrScanAction");
    expect(operator).toContain("const scanFormData = new FormData()");
    expect(operator).toContain('scanFormData.set("qrPayload", payload)');
    expect(operator).toContain("recordSupervisedStaffQrScanAction(scanFormData)");
    expect(operator).not.toContain("recordSupervisedStaffQrScanAction({");
    expect(operator).toContain("StaffQrCameraScanner");
    expect(operator).toContain("StaffQrManualTokenInput");
    expect(operator).toContain("submissionLock.current");
    expect(operator).toContain("crypto.randomUUID()");
    expect(operator).toContain("automaticStartAttempted");
    expect(operator).toContain("scheduleRearm");
    expect(operator).toContain("RESULT_DISPLAY_MS = 2_000");
    expect(operator).toContain("activeBranch?.timezone");
    expect(operator).toContain("The scanner session could not be closed.");
    expect(operator).toContain('stationState === "SESSION_EXPIRED"');
    expect(operator).toContain("Restart scanner");
    expect(operator).toContain("autoStart");
    expect(operator).toContain("continuous");
    expect(operator).toContain('preferredFacingMode="user"');
    expect(operator).toContain("showPrimaryControls={false}");
    expect(operator).not.toContain("Begin Attendance");
    expect(operator).not.toContain("Scan Next Staff Member");
  });

  it("implements resilient iOS, Android, and PWA camera behavior", () => {
    const scanner = source("src/modules/staffboard-lite/components/attendance/staff-qr-camera-scanner.tsx");

    expect(scanner).toContain('import jsQR from "jsqr"');
    expect(scanner).toContain("CAMERA_REQUEST_TIMEOUT_MS = 12_000");
    expect(scanner).toContain("getUserMediaWithTimeout");
    expect(scanner).toContain("buildCameraConstraintProfiles");
    expect(scanner).toContain('preferredFacingMode: "user" | "environment"');
    expect(scanner).toContain("applyPreferredCameraTuning");
    expect(scanner).toContain("buildContinuousFocusConstraints");
    expect(scanner).toContain("window.isSecureContext");
    expect(scanner).toContain("navigator.mediaDevices");
    expect(scanner).toContain("videoElement.play()");
    expect(scanner).toContain("decodeQrFromCanvases");
    expect(scanner).toContain("jsQR(imageData.data");
    expect(scanner).toContain("requestVideoFrameCallback");
    expect(scanner).toContain("window.requestAnimationFrame(handleFrame)");
    expect(scanner).toContain("calculateAdaptiveDecodeIntervalMs");
    expect(scanner).toContain("buildQrDecodePasses");
    expect(scanner).toContain("blockedFingerprintRef");
    expect(scanner).toContain("QR_ABSENT_FRAME_THRESHOLD");
    expect(scanner).toContain("rearmSignal");
    expect(scanner).toContain('if (!disabled) return;');
    expect(scanner).toContain("Camera stopped because the attendance scanner is not active.");
    expect(scanner).toContain("playsInline");
    expect(scanner).toContain("webkit-playsinline");
    expect(scanner).toContain('data-qr-scan-frame="true"');
    expect(scanner).toContain("aspect-square");
    expect(scanner).toContain("Upload QR image/photo");
    expect(scanner).toContain("videoTrack.applyConstraints");
    expect(scanner).not.toMatch(/from\s+["'](?:html5-qrcode|qr-scanner|@zxing)|\bBarcodeDetector\b/);
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
    const actions = source("src/modules/staffboard-lite/actions/staff-attendance-domain.actions.ts");

    expect(`${operator}\n${scanner}`).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.log/i);
    expect(`${operator}\n${scanner}`).not.toMatch(/tokenHash|passwordHash|tenantId=.*payload/i);
    expect(actions).toContain("recordSupervisedStaffQrScanAction(formData: FormData)");
    expect(actions).toContain('qrPayload: formData.get("qrPayload")');
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
    expect(page).toContain("Open My Attendance QR");
    expect(page).not.toContain("StaffQrCameraScanner");
  });

  it("keeps staff QR status polling session-derived and tenant scoped", () => {
    const service = source("src/modules/staffboard-lite/services/staff-attendance-self.service.ts");
    const action = source("src/modules/staffboard-lite/actions/staff-attendance-domain.actions.ts");
    const presentation = source("src/modules/staffboard-lite/components/attendance/staff-attendance-qr-presentation.tsx");

    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("userId: ctx.userId");
    expect(service).toContain("branchId: { in: ctx.accessibleBranchIds }");
    expect(service).toContain('permission: "staffboard.attendance.credential.self_view"');
    expect(service).toContain('permission: "staffboard.attendance.self_view"');
    expect(action).toContain("pollMyStaffAttendanceQrAction");
    expect(presentation).toContain('document.visibilityState === "visible"');
    expect(presentation).toContain("POLL_INTERVAL_MS = 4_000");
    expect(presentation).toContain("Attendance recorded");
    expect(presentation).not.toMatch(/tenantId|branchId|userId|tokenHash|passwordHash/);
  });

  it("sets a camera permissions policy for web and installed PWA routes", () => {
    const config = source("next.config.ts");

    expect(config).toContain("Permissions-Policy");
    expect(config).toContain("camera=(self), microphone=()");
  });
});
