import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import {
  createStaffLeaveApplicationSchema,
  staffLeaveReviewSchema
} from "@/modules/staffboard-lite/schemas/staff-leave.schema";
import {
  calculateStaffLeaveDays,
  enumerateLeaveDates
} from "@/modules/staffboard-lite/utils/staff-leave-calculator";
import {
  buildStaffLeaveStatusTemplatePayload,
  WHATSAPP_TEMPLATE_KEYS
} from "@/modules/notifications/templates/whatsapp-template-mapper";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Staff Leave management", () => {
  it("renders the balance year from stable institution-time-zone server state", () => {
    const settingsPage = source("src/app/(dashboard)/staffboard/leave/settings/page.tsx");
    const settingsForm = source("src/modules/staffboard-lite/components/leave/staff-leave-settings-forms.tsx");

    expect(settingsPage).toContain("getZonedDateTimeParts(new Date(), ctx.timeZone).year");
    expect(settingsPage).toContain("defaultYear={defaultYear}");
    expect(settingsForm).toContain("defaultValue={defaultYear}");
    expect(settingsForm).not.toContain("new Date().getUTCFullYear()");
  });

  it("calculates branch working dates and half-day duration server-side", () => {
    const dates = enumerateLeaveDates(
      new Date("2026-08-07"),
      new Date("2026-08-10"),
      [0]
    );
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-10"
    ]);
    expect(calculateStaffLeaveDays({
      startDate: new Date("2026-08-10"),
      endDate: new Date("2026-08-10"),
      duration: "FIRST_HALF",
      nonWorkingWeekdays: [0]
    })).toBe(0.5);
    expect(calculateStaffLeaveDays({
      startDate: new Date("2026-08-07"),
      endDate: new Date("2026-08-10"),
      duration: "FULL_DAY",
      nonWorkingWeekdays: [0],
      excludedDateKeys: new Set(["2026-08-08"])
    })).toBe(2);
  });

  it("rejects client-owned context and invalid date combinations", () => {
    const base = {
      leaveTypeId: "11111111-1111-4111-8111-111111111111",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      duration: "FULL_DAY",
      reason: "Medical appointment and recovery time."
    };
    expect(createStaffLeaveApplicationSchema.safeParse({ ...base, tenantId: "client-tenant" }).success).toBe(false);
    expect(createStaffLeaveApplicationSchema.safeParse({ ...base, staffId: "client-staff" }).success).toBe(false);
    expect(createStaffLeaveApplicationSchema.safeParse({ ...base, totalDays: 99 }).success).toBe(false);
    expect(createStaffLeaveApplicationSchema.safeParse({
      ...base,
      endDate: "2026-08-11",
      duration: "FIRST_HALF"
    }).success).toBe(false);
    expect(createStaffLeaveApplicationSchema.safeParse({
      ...base,
      startDate: "2026-12-31",
      endDate: "2027-01-02"
    }).success).toBe(false);
  });

  it("requires remarks for rejection and clarification", () => {
    const applicationId = "11111111-1111-4111-8111-111111111111";
    expect(staffLeaveReviewSchema.safeParse({ applicationId, decision: "APPROVE" }).success).toBe(true);
    expect(staffLeaveReviewSchema.safeParse({ applicationId, decision: "REJECT" }).success).toBe(false);
    expect(staffLeaveReviewSchema.safeParse({ applicationId, decision: "REQUEST_CLARIFICATION", remarks: "Please attach a certificate." }).success).toBe(true);
  });

  it("keeps employee self-service and governance permissions distinct", () => {
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).toEqual(expect.arrayContaining([
      "staffboard.leave.self_apply",
      "staffboard.leave.self_view"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).toEqual(expect.arrayContaining([
      "staffboard.leave.self_apply",
      "staffboard.leave.self_view"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).not.toContain("staffboard.leave.approve");
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain("staffboard.leave.settings.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).toEqual(expect.arrayContaining([
      "staffboard.leave.view",
      "staffboard.leave.approve",
      "staffboard.leave.settings.manage",
      "staffboard.leave.balance.manage"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).not.toContain("staffboard.leave.self_apply");
    expect(DEFAULT_ROLE_PERMISSION_MAP.OFFICE_STAFF).toContain("staffboard.leave.approve");
  });

  it("builds a safe leave WhatsApp template payload", () => {
    expect(WHATSAPP_TEMPLATE_KEYS.STAFF_LEAVE_STATUS_UPDATE).toBe("staff_leave_status_update");
    const payload = buildStaffLeaveStatusTemplatePayload({
      staffName: "Asha Verma",
      leaveType: "Sick Leave",
      startDate: "2026-08-10",
      endDate: "2026-08-11",
      totalDays: 2,
      status: "APPROVED",
      institutionName: "Example School"
    });
    expect(payload).toMatchObject({ staff_name: "Asha Verma", application_status: "Approved" });
    expect(JSON.stringify(payload)).not.toMatch(/tenantId|actorUserId|password|tokenHash/i);
  });

  it("persists tenant-safe leave, balance, attendance, document, and audit controls", () => {
    const schema = source("prisma/schema.prisma");
    const service = source("src/modules/staffboard-lite/services/staff-leave.service.ts");
    const documentService = source("src/modules/staffboard-lite/services/staff-leave-document.service.ts");
    const scannerService = source("src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts");
    const correctionService = source("src/modules/staffboard-lite/services/staff-attendance.service.ts");

    expect(schema).toContain("model StaffLeaveApplication");
    expect(schema).toContain("model StaffLeaveBalance");
    expect(schema).toContain("model StaffLeaveApplicationAction");
    expect(schema).toContain("model StaffLeaveDocument");
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("timeout: 30_000");
    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("leaveApplicationId: application.id");
    expect(service).toContain("STAFF_LEAVE_BALANCE_INSUFFICIENT");
    expect(service).toContain("STAFF_LEAVE_ATTENDANCE_CONFLICT");
    expect(documentService).toContain("ensureStaffLeaveDocumentsBucket");
    expect(documentService).toContain("createSignedUrl");
    expect(documentService).toContain("hasPrincipalRole");
    expect(documentService).toContain("staffLeaveApprover.findFirst");
    expect(scannerService).toContain("STAFF_ATTENDANCE_MANAGED_BY_LEAVE");
    expect(correctionService).toContain("STAFF_ATTENDANCE_MANAGED_BY_LEAVE");
  });

  it("exposes permission-filtered leave routes without client authority fields", () => {
    const navigation = source("src/components/app-shell/navigation.ts");
    const form = source("src/modules/staffboard-lite/components/leave/staff-leave-application-form.tsx");
    const reviewPage = source("src/app/(dashboard)/staffboard/leave/review/page.tsx");
    const settingsPage = source("src/app/(dashboard)/staffboard/leave/settings/page.tsx");
    expect(navigation).toContain('href: "/staffboard/leave"');
    expect(navigation).toContain('permissions: ["staffboard.leave.self_view"]');
    expect(form).not.toContain('name="tenantId"');
    expect(form).not.toContain('name="branchId"');
    expect(form).not.toContain('name="staffId"');
    expect(form).not.toContain('name="totalDays"');
    expect(reviewPage).toContain("error instanceof AppError");
    expect(reviewPage).toContain('permissions.has("staffboard.leave.settings.manage")');
    const detailPage = source("src/app/(dashboard)/staffboard/leave/[applicationId]/page.tsx");
    expect(detailPage).toContain("renderNotFound()");
    expect(settingsPage).toContain("error instanceof AppError");
  });
});
