import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  configureApiUnauthorizedHandler,
  getApiBaseUrl,
  getMobileMe,
  mobileLogin,
  scanStaffAttendanceQr,
  getMyStaffAttendanceStatus
} from "../../apps/mobile/src/api/client";
import { parseStaffAttendanceQrPayload } from "../../apps/mobile/src/features/staff-attendance/qr-payload";
import { getRoleAwareActions } from "../../apps/mobile/src/lib/role-actions";
import type { MobileUser } from "../../apps/mobile/src/api/contracts";
import { readFileSync } from "node:fs";

const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

function userWithRoles(codes: string[]): MobileUser {
  return {
    name: "Demo User",
    email: "demo@example.test",
    roles: codes.map((code) => ({ code, label: code })),
    capabilities: {
      canScanStaffQr: codes.some((code) => ["STAFF", "CLASS_TEACHER", "TEACHER"].includes(code)),
      canViewMyAttendance: codes.some((code) => ["STAFF", "CLASS_TEACHER", "TEACHER"].includes(code)),
      canMarkStudentAttendance: codes.includes("CLASS_TEACHER")
    }
  };
}

describe("native mobile foundation utilities", () => {
  afterEach(() => {
    configureApiUnauthorizedHandler(null);
    process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    vi.unstubAllGlobals();
  });

  it("extracts staff QR token from raw and JSON payloads", () => {
    expect(parseStaffAttendanceQrPayload(" raw-token ")).toEqual({ ok: true, token: "raw-token" });
    expect(parseStaffAttendanceQrPayload("{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\" raw-json-token \"}")).toEqual({
      ok: true,
      token: "raw-json-token"
    });
  });

  it("rejects malformed or unrelated QR payloads safely", () => {
    expect(parseStaffAttendanceQrPayload(" ")).toMatchObject({ ok: false });
    expect(parseStaffAttendanceQrPayload("{bad-json")).toMatchObject({ ok: false });
    expect(parseStaffAttendanceQrPayload("{\"type\":\"OTHER\",\"token\":\"secret\"}")).toMatchObject({ ok: false });
  });

  it("maps teacher and staff roles to focused v0.1 actions", () => {
    expect(getRoleAwareActions(userWithRoles(["CLASS_TEACHER"])).map((action) => action.label)).toEqual([
      "Mark Student Attendance",
      "Scan QR",
      "My Attendance"
    ]);
    expect(getRoleAwareActions(userWithRoles(["STAFF"])).map((action) => action.label)).toEqual([
      "Scan QR",
      "My Attendance"
    ]);
  });

  it("uses backend capability flags for enabled mobile actions", () => {
    const teacher = userWithRoles(["STAFF"]);
    teacher.capabilities.canMarkStudentAttendance = true;
    expect(getRoleAwareActions(teacher).map((action) => action.label)).toContain("Mark Student Attendance");

    const noScan = userWithRoles(["STAFF"]);
    noScan.capabilities.canScanStaffQr = false;
    noScan.capabilities.canViewMyAttendance = false;
    expect(getRoleAwareActions(noScan).map((action) => action.label)).not.toContain("Scan QR");
  });

  it("does not expose unsupported admin native routes as enabled actions", () => {
    const adminActions = getRoleAwareActions(userWithRoles(["ADMIN"]));
    expect(adminActions.some((action) => action.label === "Dashboard Summary" && action.disabled)).toBe(true);
  });

  it("rejects missing or invalid API base URLs safely", () => {
    expect(() => getApiBaseUrl("")).toThrow(ApiError);
    expect(() => getApiBaseUrl("jinacampus.local")).toThrow(ApiError);
    expect(getApiBaseUrl("https://school.example.com/")).toBe("https://school.example.com");
  });

  it("keeps native app config release-candidate ready without committed private URLs", () => {
    const appConfig = JSON.parse(readFileSync("apps/mobile/app.json", "utf8")) as {
      expo: {
        name: string;
        description: string;
        icon: string;
        splash: { image: string; backgroundColor: string };
        android: { adaptiveIcon: { foregroundImage: string } };
      };
    };
    const envExample = readFileSync("apps/mobile/.env.example", "utf8");

    expect(appConfig.expo.name).toBe("JinaCampus");
    expect(appConfig.expo.description).toBe("The Complete School OS");
    expect(appConfig.expo.icon).toBe("./assets/icon.png");
    expect(appConfig.expo.splash.image).toBe("./assets/splash.png");
    expect(appConfig.expo.splash.backgroundColor).toBe("#F8FAFC");
    expect(appConfig.expo.android.adaptiveIcon.foregroundImage).toBe("./assets/adaptive-icon.png");
    expect(envExample).toContain("EXPO_PUBLIC_API_BASE_URL=https://your-approved-backend-url.example.com");
    expect(envExample).not.toMatch(/localhost:3000|JinaCampus@|Authorization:|token=.*[A-Za-z0-9]/i);
  });

  it("posts School ID login requests and keeps tenant slug wording out of the mobile login UI", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://school.example.test/";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      token: "mobile-session-token",
      user: {
        name: "Demo Teacher",
        email: "teacher@example.test",
        roles: [{ code: "CLASS_TEACHER", label: "Class Teacher" }],
        capabilities: {
          canScanStaffQr: true,
          canViewMyAttendance: true,
          canMarkStudentAttendance: true
        }
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await mobileLogin({
      schoolId: "jinacampus-demo",
      email: "teacher@example.test",
      password: "valid-password"
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://school.example.test/api/mobile/auth/login");
    expect(init.body).toBe(JSON.stringify({
      schoolId: "jinacampus-demo",
      email: "teacher@example.test",
      password: "valid-password"
    }));
    expect(String(init.body)).not.toContain("tenantSlug");

    const loginSource = readFileSync("apps/mobile/app/login.tsx", "utf8");
    const authSource = readFileSync("apps/mobile/src/auth/auth-context.tsx", "utf8");
    expect(loginSource).toContain('label="School ID"');
    expect(loginSource).toContain("School ID, email, and password are required.");
    expect(authSource).toContain("Invalid School ID, email, or password.");
    expect(loginSource).not.toMatch(/tenantSlug|Tenant Slug|tenant slug|label="Tenant"/);
  });

  it("adds bearer token headers for protected mobile API calls", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://school.example.test/";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      message: "Check-in successful",
      purpose: "CHECK_IN",
      attendanceDate: "2026-05-26",
      status: "PRESENT",
      checkInAt: "2026-05-26T09:00:00.000Z",
      checkOutAt: null,
      workingMinutes: null
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await scanStaffAttendanceQr("mobile-session-token", "decoded-qr-token");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://school.example.test/api/mobile/staff-attendance/scan");
    expect(init.body).toBe(JSON.stringify({ token: "decoded-qr-token" }));
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get("Authorization")).toBe("Bearer mobile-session-token");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("tokenHash");
  });

  it("calls the unauthorized handler when a protected mobile API returns 401", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://school.example.test";
    const unauthorizedHandler = vi.fn();
    configureApiUnauthorizedHandler(unauthorizedHandler);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: false,
      error: "Please sign in to continue."
    }), { status: 401 })));

    await expect(getMobileMe("expired-session-token")).rejects.toMatchObject({
      code: "API_REQUEST_FAILED",
      status: 401
    });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
  });

  it("maps server failures to generic mobile messages without leaking internals", async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://school.example.test";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: false,
      error: "Prisma failed for tenantId=secret tokenHash=secret"
    }), { status: 500 })));

    await expect(getMyStaffAttendanceStatus("mobile-session-token")).rejects.toMatchObject({
      message: "Server is unavailable. Please try again.",
      status: 500
    });
  });

  it("uses SecureStore for mobile session tokens without console logging tokens", () => {
    const source = readFileSync("apps/mobile/src/auth/session-store.ts", "utf8");
    expect(source).toContain("expo-secure-store");
    expect(source).toContain("saveMobileToken");
    expect(source).toContain("getMobileToken");
    expect(source).toContain("clearMobileToken");
    expect(source).not.toContain("console.");
    expect(source).not.toContain("AsyncStorage");
  });

  it("keeps auth, QR scan, and API client sources free of token logging", () => {
    const source = [
      "apps/mobile/src/api/client.ts",
      "apps/mobile/src/auth/auth-context.tsx",
      "apps/mobile/src/features/staff-attendance/staff-qr-scanner.tsx"
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).not.toContain("console.");
    expect(source).not.toContain("tokenHash");
    expect(source).toContain("configureApiUnauthorizedHandler");
    expect(source).toContain("scanStaffAttendanceQr(sessionToken, token)");
  });

  it("wires teacher attendance to class-section, student, and submit APIs", () => {
    const source = readFileSync("apps/mobile/src/features/teacher-attendance/teacher-attendance-shell.tsx", "utf8");

    expect(source).toContain("getTeacherClassSections");
    expect(source).toContain("getTeacherClassSectionStudents");
    expect(source).toContain("submitStudentAttendance");
    expect(source).toContain("Mark All Present");
    expect(source).toContain("Enter attendance date in YYYY-MM-DD format.");
    expect(source).toContain("Offline drafts are planned for a future phase.");
  });

  it("hardens QR fallback and My Attendance states for native release candidate", () => {
    const scannerSource = readFileSync("apps/mobile/src/features/staff-attendance/staff-qr-scanner.tsx", "utf8");
    const statusSource = readFileSync("apps/mobile/app/(app)/attendance-status.tsx", "utf8");

    expect(scannerSource).toContain('accessibilityLabel="Manual QR token"');
    expect(scannerSource).toContain('setManualValue("")');
    expect(scannerSource).toContain("setResult(null)");
    expect(statusSource).toContain("Loading today&apos;s attendance status...");
    expect(statusSource).toContain("No attendance recorded yet today.");
    expect(statusSource).toContain("Refresh Status");
    expect(`${scannerSource}\n${statusSource}`).not.toMatch(/tokenHash|rawToken|tenantId=.*secret/i);
  });

  it("keeps native v0.1 UI premium, password-safe, and scoped to approved flows", () => {
    const source = [
      "apps/mobile/src/lib/theme.ts",
      "apps/mobile/src/components/ui.tsx",
      "apps/mobile/app/login.tsx",
      "apps/mobile/app/(app)/home.tsx"
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(source).toContain("surfaceGlass");
    expect(source).toContain("boxShadow");
    expect(source).toContain("PasswordField");
    expect(source).toContain("ActionTile");
    expect(source).toContain("accessibilityLabel={toggleLabel}");
    expect(source).not.toMatch(/FeeDesk|GradeBook|passwordHash|tokenHash|rawToken/i);
  });
});
