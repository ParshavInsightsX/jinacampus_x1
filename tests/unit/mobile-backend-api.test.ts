import { AppError } from "@/lib/errors";
import { mobileApiError } from "@/lib/mobile-api/responses";
import {
  createMobileLoginSession,
  requireMobileAuth,
  revokeMobileSession
} from "@/lib/mobile-api/auth";
import {
  getMobileStaffAttendanceStatus,
  scanMobileStaffAttendanceQr
} from "@/lib/mobile-api/staff-attendance";
import {
  listMobileTeacherClassSectionStudents,
  listMobileTeacherClassSections,
  submitMobileStudentAttendance
} from "@/lib/mobile-api/teacher-attendance";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    tenant: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    academicYear: { findFirst: vi.fn() },
    institution: { findFirst: vi.fn() },
    staffProfile: { findFirst: vi.fn() },
    staffAttendanceRecord: { findFirst: vi.fn() }
  },
  verifyPassword: vi.fn(),
  createRawSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
  getSessionExpiresAt: vi.fn(),
  writeAuditLog: vi.fn(),
  getEffectivePermissions: vi.fn(),
  requirePermission: vi.fn(),
  scanStaffAttendanceQr: vi.fn(),
  listClassSectionsForAttendance: vi.fn(),
  listActiveEnrolledStudentsForAttendance: vi.fn(),
  submitDailyStudentAttendance: vi.fn()
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/auth/session", () => ({
  createRawSessionToken: mocks.createRawSessionToken,
  hashSessionToken: mocks.hashSessionToken,
  getSessionExpiresAt: mocks.getSessionExpiresAt
}));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions,
  requirePermission: mocks.requirePermission
}));
vi.mock("@/modules/staffboard-lite/services/staff-qr.service", () => ({
  scanStaffAttendanceQr: mocks.scanStaffAttendanceQr
}));
vi.mock("@/modules/academia/queries", () => ({
  listClassSectionsForAttendance: mocks.listClassSectionsForAttendance,
  listActiveEnrolledStudentsForAttendance: mocks.listActiveEnrolledStudentsForAttendance
}));
vi.mock("@/modules/academia/services/student-attendance.service", () => ({
  submitDailyStudentAttendance: mocks.submitDailyStudentAttendance
}));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const classSectionId = "00000000-0000-0000-0000-000000000005";
const studentId = "00000000-0000-0000-0000-000000000006";
const staffProfileId = "00000000-0000-0000-0000-000000000007";
const institutionId = "00000000-0000-0000-0000-000000000008";
const rawToken = "raw-mobile-token";
const tokenHash = "hashed-mobile-token";
const qrToken = "raw-qr-token";
const futureSessionExpiry = new Date("2099-06-01T00:00:00.000Z");

function requestWithBearer(token = rawToken) {
  return new Request("https://school.example.test/api/mobile/me", {
    headers: {
      authorization: `Bearer ${token}`,
      "user-agent": "Vitest Mobile"
    }
  });
}

function loginRequest() {
  return new Request("https://school.example.test/api/mobile/auth/login", {
    method: "POST",
    headers: { "user-agent": "Vitest Mobile" }
  });
}

function sessionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "mobile-session-id",
    tenantId,
    userId,
    tokenHash,
    expiresAt: futureSessionExpiry,
    revokedAt: null,
    tenant: { id: tenantId, name: "Demo Tenant", status: "ACTIVE" },
    user: {
      id: userId,
      tenantId,
      email: "teacher@example.test",
      firstName: "Demo",
      middleName: null,
      lastName: "Teacher",
      displayName: "Demo Teacher",
      userType: "STAFF",
      status: "ACTIVE",
      passwordCredential: { mustChange: false },
      branchAccesses: [
        {
          tenantId,
          branchId,
          isPrimary: true,
          branch: {
            tenantId,
            institutionId,
            name: "Main Branch",
            code: "MAIN",
            status: "ACTIVE",
            institution: {
              id: institutionId,
              name: "Jina Campus School",
              displayName: "JinaCampus Demo",
              logoUrl: "https://example.test/logo.png",
              status: "ACTIVE"
            }
          }
        }
      ],
      roleAssignments: [
        {
          tenantId,
          startsAt: null,
          endsAt: null,
          role: {
            tenantId,
            code: "CLASS_TEACHER",
            name: "Class Teacher",
            isActive: true
          }
        }
      ]
    },
    ...overrides
  };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.tenant.findUnique.mockResolvedValue({
    id: tenantId,
    slug: "jinacampus-demo",
    name: "Demo Tenant",
    status: "ACTIVE"
  });
  mocks.db.user.findUnique.mockResolvedValue({
    id: userId,
    tenantId,
    email: "teacher@example.test",
    status: "ACTIVE",
    passwordCredential: { passwordHash: "stored-password-hash", mustChange: false }
  });
  mocks.db.userRoleAssignment.findMany.mockResolvedValue([
    { role: { code: "TEACHER" } }
  ]);
  mocks.db.user.update.mockResolvedValue({});
  mocks.db.session.create.mockResolvedValue({});
  mocks.db.session.findUnique.mockResolvedValue(sessionRecord());
  mocks.db.session.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.academicYear.findFirst.mockResolvedValue({ id: academicYearId, name: "2026-27" });
  mocks.db.institution.findFirst.mockResolvedValue(null);
  mocks.db.staffProfile.findFirst.mockResolvedValue({
    id: staffProfileId,
    tenantId,
    branchId,
    userId,
    employmentStatus: "ACTIVE",
    branch: {
      status: "ACTIVE",
      timezone: "Asia/Kolkata"
    }
  });
  mocks.db.staffAttendanceRecord.findFirst.mockResolvedValue(null);
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.createRawSessionToken.mockReturnValue(rawToken);
  mocks.hashSessionToken.mockResolvedValue(tokenHash);
  mocks.getSessionExpiresAt.mockReturnValue(futureSessionExpiry);
  mocks.writeAuditLog.mockResolvedValue(undefined);
  mocks.getEffectivePermissions.mockResolvedValue(new Set([
    "staffboard.attendance.credential.self_view",
    "academia.attendance.view",
    "academia.attendance.mark"
  ]));
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.scanStaffAttendanceQr.mockResolvedValue({
    purpose: "CHECK_IN",
    attendanceDate: "2026-05-26",
    status: "PRESENT",
    checkInAt: "2026-05-26T09:00:00.000Z",
    checkOutAt: null,
    workingMinutes: null,
    message: "Check-in successful",
    tokenHash: "must-not-leak"
  });
  mocks.listClassSectionsForAttendance.mockResolvedValue([
    {
      id: classSectionId,
      className: "Class 1",
      sectionName: "A",
      displayName: "Class 1-A"
    }
  ]);
  mocks.listActiveEnrolledStudentsForAttendance.mockResolvedValue([
    {
      studentId,
      admissionNo: "ADM-001",
      rollNumber: "1",
      displayName: "Demo Student"
    }
  ]);
  mocks.submitDailyStudentAttendance.mockResolvedValue({
    submittedCount: 1,
    totalActiveStudents: 1,
    presentCount: 1,
    absentCount: 0,
    lateCount: 0,
    halfDayCount: 0,
    onLeaveCount: 0,
    excusedCount: 0,
    createdCount: 1,
    updatedCount: 0
  });
});

describe("mobile backend auth", () => {
  it("rejects invalid credentials with a safe message", async () => {
    mocks.verifyPassword.mockResolvedValueOnce(false);

    const error = await createMobileLoginSession({
      schoolId: "jinacampus-demo",
      email: "teacher@example.test",
      password: "wrong"
    }, loginRequest()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    const response = mobileApiError(error);
    const body = await responseBody(response);
    expect(response.status).toBe(401);
    expect(body).toEqual({ success: false, error: "Invalid School ID, email, or password." });
    expect(JSON.stringify(body)).not.toContain("teacher@example.test");
  });

  it("returns the raw token once, stores only tokenHash, and never returns passwordHash", async () => {
    const result = await createMobileLoginSession({
      schoolId: "JinaCampus-Demo",
      email: "Teacher@Example.Test",
      password: "valid-password"
    }, loginRequest());

    expect(mocks.db.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: "jinacampus-demo" } });
    expect(result.token).toBe(rawToken);
    expect(result.user.email).toBe("teacher@example.test");
    expect(result.user.capabilities.canScanStaffQr).toBe(false);
    expect(mocks.db.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        userId,
        tokenHash,
        expiresAt: futureSessionExpiry
      })
    });
    expect(JSON.stringify(mocks.db.session.create.mock.calls)).not.toContain(rawToken);
    expect(JSON.stringify(result)).not.toContain("passwordHash");
    expect(JSON.stringify(result)).not.toContain(tokenHash);
  });

  it("keeps legacy tenantSlug compatibility while mobile clients send schoolId", async () => {
    const result = await createMobileLoginSession({
      tenantSlug: "jinacampus-demo",
      email: "teacher@example.test",
      password: "valid-password"
    }, loginRequest());

    expect(mocks.db.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: "jinacampus-demo" } });
    expect(result.token).toBe(rawToken);
    expect(JSON.stringify(result)).not.toContain("tenantSlug");
  });

  it("requires a bearer token for protected mobile APIs", async () => {
    await expect(requireMobileAuth(new Request("https://school.example.test/api/mobile/me")))
      .rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("blocks mobile login and protected APIs until a temporary password is changed", async () => {
    mocks.db.user.findUnique.mockResolvedValueOnce({
      id: userId,
      tenantId,
      email: "teacher@example.test",
      status: "ACTIVE",
      passwordCredential: { passwordHash: "stored-password-hash", mustChange: true }
    });

    await expect(createMobileLoginSession({
      schoolId: "jinacampus-demo",
      email: "teacher@example.test",
      password: "valid-password"
    }, loginRequest())).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
      status: 403
    });
    expect(mocks.db.session.create).not.toHaveBeenCalled();

    mocks.db.session.findUnique.mockResolvedValueOnce(sessionRecord({
      user: {
        ...sessionRecord().user,
        passwordCredential: { mustChange: true }
      }
    }));
    await expect(requireMobileAuth(requestWithBearer())).rejects.toMatchObject({
      code: "PASSWORD_CHANGE_REQUIRED",
      status: 403
    });
  });

  it("resolves the active academic year through the current branch institution", async () => {
    const auth = await requireMobileAuth(requestWithBearer());

    expect(mocks.db.academicYear.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        institutionId,
        status: "ACTIVE",
        isActive: true
      })
    }));
    expect(auth.ctx.activeAcademicYearId).toBe(academicYearId);
  });

  it("rejects revoked and expired tokens", async () => {
    mocks.db.session.findUnique.mockResolvedValueOnce(sessionRecord({ revokedAt: new Date("2026-05-26T10:00:00.000Z") }));
    await expect(requireMobileAuth(requestWithBearer())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    mocks.db.session.findUnique.mockResolvedValueOnce(sessionRecord({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }));
    await expect(requireMobileAuth(requestWithBearer())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("revokes the current mobile session on logout", async () => {
    await expect(revokeMobileSession(requestWithBearer())).resolves.toEqual({ success: true });
    expect(mocks.db.session.updateMany).toHaveBeenCalledWith({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain(rawToken);
  });
});

describe("mobile staff attendance APIs", () => {
  it("calls existing QR scan service with server-derived context only", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    const result = await scanMobileStaffAttendanceQr(auth.ctx, { token: qrToken });

    expect(mocks.scanStaffAttendanceQr).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      userId,
      activeBranchId: branchId,
      activeAcademicYearId: academicYearId
    }), { token: qrToken });
    expect(result).toMatchObject({
      purpose: "CHECK_IN",
      attendanceDate: "2026-05-26",
      status: "PRESENT",
      message: "Check-in successful"
    });
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });

  it("rejects client-provided tenant, branch, and staff IDs for QR scan", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    await expect(scanMobileStaffAttendanceQr(auth.ctx, {
      token: qrToken,
      tenantId,
      branchId,
      staffId: staffProfileId
    })).rejects.toMatchObject({ issues: expect.any(Array) });
    expect(mocks.scanStaffAttendanceQr).not.toHaveBeenCalled();
  });

  it("maps invalid and expired QR errors to safe mobile API responses", async () => {
    const invalidResponse = mobileApiError(new AppError("INVALID_STAFF_QR", "raw database detail", 400));
    const invalidBody = await responseBody(invalidResponse);
    expect(invalidResponse.status).toBe(400);
    expect(invalidBody).toEqual({
      success: false,
      error: "This QR code is invalid or no longer available."
    });

    const expiredResponse = mobileApiError(new AppError("STAFF_QR_EXPIRED", "raw database detail", 409));
    const expiredBody = await responseBody(expiredResponse);
    expect(expiredResponse.status).toBe(409);
    expect(expiredBody).toEqual({
      success: false,
      error: "This QR code has expired. Please scan a fresh QR code."
    });
  });

  it("returns only the authenticated staff member's attendance status", async () => {
    mocks.db.staffAttendanceRecord.findFirst.mockResolvedValueOnce({
      attendanceDate: new Date("2026-05-26T00:00:00.000Z"),
      status: "PRESENT",
      checkInAt: new Date("2026-05-26T09:00:00.000Z"),
      checkOutAt: null,
      workingMinutes: null
    });
    const auth = await requireMobileAuth(requestWithBearer());
    const result = await getMobileStaffAttendanceStatus(auth.ctx, { date: "2026-05-26" });

    expect(mocks.db.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, userId, employmentStatus: "ACTIVE" })
    }));
    expect(mocks.db.staffAttendanceRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId, staffId: staffProfileId })
    }));
    expect(result.attendance).toMatchObject({
      attendanceDate: "2026-05-26",
      status: "PRESENT",
      checkInAt: "2026-05-26T09:00:00.000Z"
    });
    expect(JSON.stringify(result)).not.toContain("tokenHash");
  });
});

describe("mobile teacher attendance APIs", () => {
  it("lists class sections through permission-checked tenant context", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    const result = await listMobileTeacherClassSections(auth.ctx);

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ tenantId, userId }),
      permission: "academia.attendance.mark",
      branchId,
      academicYearId
    });
    expect(mocks.listClassSectionsForAttendance).toHaveBeenCalledWith(expect.objectContaining({ tenantId, userId }));
    expect(result.classSections).toEqual([
      {
        id: classSectionId,
        className: "Class 1",
        sectionName: "A",
        displayName: "Class 1-A"
      }
    ]);
  });

  it("returns active enrolled students only after class-section access is verified", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    const result = await listMobileTeacherClassSectionStudents(auth.ctx, { classSectionId });

    expect(mocks.listActiveEnrolledStudentsForAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId }),
      { classSectionId }
    );
    expect(result.students).toEqual([
      {
        studentId,
        admissionNo: "ADM-001",
        rollNumber: "1",
        name: "Demo Student"
      }
    ]);
  });

  it("submits attendance through the existing Academia service", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    const input = {
      classSectionId,
      attendanceDate: "2026-05-26",
      entries: [{ studentId, status: "PRESENT", remarks: "" }]
    };

    const result = await submitMobileStudentAttendance(auth.ctx, input);

    expect(mocks.submitDailyStudentAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId, activeBranchId: branchId }),
      expect.objectContaining({
        classSectionId,
        attendanceDate: new Date("2026-05-26T00:00:00.000Z"),
        sessionType: "FULL_DAY",
        entries: [
          expect.objectContaining({
            studentId,
            status: "PRESENT"
          })
        ]
      })
    );
    expect(result.summary).toMatchObject({ total: 1, present: 1, created: 1 });
  });

  it("rejects client-provided tenant and actor IDs for attendance submit", async () => {
    const auth = await requireMobileAuth(requestWithBearer());
    await expect(submitMobileStudentAttendance(auth.ctx, {
      classSectionId,
      attendanceDate: "2026-05-26",
      tenantId,
      actorUserId: userId,
      entries: [{ studentId, status: "PRESENT", remarks: "" }]
    })).rejects.toMatchObject({ issues: expect.any(Array) });
    expect(mocks.submitDailyStudentAttendance).not.toHaveBeenCalled();
  });

  it("does not leak permission names in forbidden mobile errors", async () => {
    const response = mobileApiError(new Error("FORBIDDEN_PERMISSION:academia.attendance.mark"));
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: "You do not have permission to perform this action."
    });
    expect(JSON.stringify(body)).not.toContain("academia.attendance.mark");
  });
});
