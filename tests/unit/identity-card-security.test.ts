import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("identity cards and supervised staff attendance", () => {
  it("adds additive tenant-scoped card and private staff-photo persistence", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260825120000_add_identity_cards/migration.sql");

    expect(schema).toContain("model StudentIdentityCard {");
    expect(schema).toContain("model StaffProfilePhoto {");
    expect(schema).toContain('@@unique([tenantId, id], map: "student_identity_cards_tenant_id_id_key")');
    expect(schema).toContain("@@index([tenantId, branchId, academicYearId, status])");
    expect(migration).toContain('CREATE TABLE "student_identity_cards"');
    expect(migration).toContain('CREATE TABLE "staff_profile_photos"');
    expect(migration).toContain('ALTER TABLE "student_identity_cards" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "staff_profile_photos" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("academia.student.id_card.manage");
    expect(migration).toContain("staffboard.attendance.credential.self_view");
    expect(migration).toContain("staffboard.attendance.self_scan");
    expect(migration).toContain('"staffSelfScanEnabled" = false');
    expect(migration).toContain("'HYBRID' THEN 'SUPERVISED_QR'");
  });

  it("restricts staff card lifecycle actions to a Principal-family manager on the server", () => {
    const service = source("src/modules/staffboard-lite/services/staff-attendance-credentials.service.ts");
    const actions = source("src/modules/staffboard-lite/actions/staff-attendance-domain.actions.ts");

    expect(service).toContain("requireCredentialManagerRole(ctx)");
    expect(service).toContain("hasPrincipalRole(ctx.roleCodes");
    expect(service).toContain('permission: "staffboard.attendance.credential.manage"');
    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("branchId: { in: ctx.accessibleBranchIds }");
    expect(service).toContain("STAFF_ATTENDANCE_CREDENTIAL_REPLACEMENT_REASON_REQUIRED");
    expect(service).toContain("STAFF_ATTENDANCE_CREDENTIAL_PRINTED");
    expect(service).toContain("STAFF_ATTENDANCE_CREDENTIAL_REVOKED");
    expect(actions).toContain("recordStaffAttendanceCredentialPrint");
  });

  it("allows only the signed-in linked staff member to view their active Attendance QR", () => {
    const service = source("src/modules/staffboard-lite/services/staff-attendance-credentials.service.ts");
    const selfPage = source("src/app/(dashboard)/staffboard/attendance/card/page.tsx");

    expect(service).toContain("userId: ctx.userId");
    expect(service).toContain('permission: "staffboard.attendance.credential.self_view"');
    expect(service).toContain('viewerScope: "SELF"');
    expect(selfPage).toContain("StaffAttendanceQrPresentation");
    expect(selfPage).not.toContain("StaffIdentityCard");
    expect(selfPage).not.toMatch(/recordStaffAttendanceCredentialPrintAction|window\.print|download=/);
  });

  it("keeps attendance camera scanning on the authorised operator route only", () => {
    const scanPage = source("src/app/(dashboard)/staffboard/attendance/scan/page.tsx");
    const legacyService = source("src/modules/staffboard-lite/services/staff-qr.service.ts");
    const settings = source("src/app/(dashboard)/campus-core/settings/page.tsx");

    expect(scanPage).toContain('permissions.has("staffboard.attendance.scan")');
    expect(scanPage).toContain("StaffAttendanceOperatorScanner");
    expect(scanPage).not.toContain("StaffQrScanForm");
    expect(legacyService).toContain("STAFF_SELF_SCAN_DISABLED");
    expect(legacyService).not.toContain("db.");
    expect(settings).not.toContain("Allow staff self check-in");
    expect(settings).not.toContain('option value="HYBRID"');
  });

  it("prints only card surfaces and hides digital-only staff cards", () => {
    const css = source("src/app/globals.css");
    const staffCard = source("src/modules/staffboard-lite/components/attendance/staff-identity-card.tsx");

    expect(css).toContain("@media print");
    expect(css).toContain(".identity-card-print-area");
    expect(css).toContain("width: 85.6mm");
    expect(css).toContain("height: 53.98mm");
    expect(css).toContain("visibility: hidden !important");
    expect(css).toContain(".identity-card-digital-only");
    expect(staffCard).toContain("QRCodeSVG");
    expect(staffCard).not.toMatch(/tokenHash|rawToken/);
    expect(staffCard).toContain("INR 500");
  });

  it("enforces student card permission and tenant, institution, branch, year, and enrollment scope", () => {
    const service = source("src/modules/academia/services/student-identity-card.service.ts");
    const route = source("src/app/(dashboard)/academia/students/[studentId]/id-card/page.tsx");
    const card = source("src/modules/academia/components/student-identity-card.tsx");

    expect(service).toContain('permission: "academia.student.id_card.manage"');
    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("institutionId: ctx.institutionId");
    expect(service).toContain("branchId: { in: ctx.accessibleBranchIds }");
    expect(service).toContain("academicYearId");
    expect(service).toContain("enrollmentId");
    expect(service).toContain("STUDENT_ID_CARD_REISSUE_REASON_REQUIRED");
    expect(route).toContain("getEffectivePermissions");
    expect(card).not.toContain("QRCode");
    expect(card).toContain("Emergency Contact");
    expect(card).toContain("institution property and is non-transferable");
  });

  it("uses private, short-lived, permission-checked photo access", () => {
    const staffPhoto = source("src/modules/staffboard-lite/services/staff-profile-photo.service.ts");
    const studentPhoto = source("src/modules/academia/services/student-identity-card.service.ts");

    expect(staffPhoto).toContain("createSignedUrl");
    expect(staffPhoto).toContain("60");
    expect(staffPhoto).toContain("staff.userId === ctx.userId");
    expect(staffPhoto).toContain('permission: "staffboard.staff.update"');
    expect(studentPhoto).toContain("createSignedUrl(document.storagePath, 60");
    expect(studentPhoto).toContain('permission: "academia.student.id_card.manage"');
  });

  it("fails closed without joining identity tables into stable Staff CRUD", () => {
    const readiness = source("src/lib/schema-readiness/identity-cards.ts");
    const staffQueries = source("src/modules/staffboard-lite/queries/staff-profile.queries.ts");
    const credentialPage = source("src/app/(dashboard)/staffboard/attendance/credentials/page.tsx");
    const staffPhotoRoute = source("src/app/api/staffboard/staff/[staffId]/photo/route.ts");

    expect(readiness).toContain("to_regclass('public.staff_profile_photos')");
    expect(readiness).toContain("to_regclass('public.student_identity_cards')");
    expect(readiness).toContain("IDENTITY_CARD_UPGRADE_REQUIRED");
    expect(staffQueries).toContain("identityCardSchemaAvailable");
    expect(credentialPage).toContain("isIdentityCardSchemaAvailable");
    expect(staffPhotoRoute).toContain("requireIdentityCardSchema");
  });
});
