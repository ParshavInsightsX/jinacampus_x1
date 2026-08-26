import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import {
  findApplicableCalendarEntry,
  listCalendarDateKeysForRange
} from "@/modules/campus-core/calendar/calendar-policy";
import {
  createAcademicCalendarEntrySchema,
  updateAcademicCalendarEntrySchema
} from "@/modules/campus-core/calendar/calendar-schemas";
import {
  calendarDateKey,
  enumerateCalendarDates,
  staffCalendarAudience
} from "@/modules/campus-core/calendar/calendar-utils";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const institutionId = "00000000-0000-4000-8000-000000000001";
const branchId = "00000000-0000-4000-8000-000000000002";
const academicYearId = "00000000-0000-4000-8000-000000000003";

function validInput() {
  return {
    institutionId,
    branchId,
    academicYearId,
    entryType: "HOLIDAY",
    name: "Founders Day",
    description: "Institution holiday",
    startDate: "2026-08-14",
    endDate: "2026-08-15",
    audiences: ["STUDENTS", "TEACHING_STAFF", "NON_TEACHING_STAFF"]
  };
}

describe("Academic and institutional calendar", () => {
  it("validates calendar ranges and rejects client-owned authority fields", () => {
    expect(createAcademicCalendarEntrySchema.safeParse(validInput()).success).toBe(true);
    expect(createAcademicCalendarEntrySchema.safeParse({ ...validInput(), audiences: [] }).success).toBe(false);
    expect(createAcademicCalendarEntrySchema.safeParse({
      ...validInput(),
      startDate: "2026-08-16",
      endDate: "2026-08-15"
    }).success).toBe(false);
    expect(createAcademicCalendarEntrySchema.safeParse({ ...validInput(), tenantId: "client-tenant" }).success).toBe(false);
    expect(createAcademicCalendarEntrySchema.safeParse({ ...validInput(), actorUserId: "client-actor" }).success).toBe(false);
    expect(updateAcademicCalendarEntrySchema.safeParse({
      ...validInput(),
      calendarEntryId: "00000000-0000-4000-8000-000000000004",
      attendanceStatus: "PRESENT"
    }).success).toBe(false);
  });

  it("enumerates inclusive date ranges and maps staff groups explicitly", () => {
    const dates = enumerateCalendarDates(new Date("2026-08-14"), new Date("2026-08-16"));
    expect(dates.map(calendarDateKey)).toEqual(["2026-08-14", "2026-08-15", "2026-08-16"]);
    expect(staffCalendarAudience("TEACHER")).toBe("TEACHING_STAFF");
    expect(staffCalendarAudience("ADMIN")).toBe("NON_TEACHING_STAFF");
  });

  it("scopes date policy lookups by tenant, institution, branch, year, and audience", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const client = { academicCalendarEntry: { findFirst } } as unknown as PrismaClient;
    const attendanceDate = new Date("2026-08-15");

    await findApplicableCalendarEntry(client, {
      tenantId: "00000000-0000-4000-8000-000000000005",
      institutionId,
      branchId,
      academicYearId,
      attendanceDate,
      audience: "STUDENTS"
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "00000000-0000-4000-8000-000000000005",
        institutionId,
        academicYearId,
        status: "ACTIVE",
        startDate: { lte: attendanceDate },
        endDate: { gte: attendanceDate },
        audiences: { has: "STUDENTS" },
        OR: [{ branchId: null }, { branchId }]
      },
      select: expect.any(Object),
      orderBy: [{ branchId: "desc" }, { startDate: "asc" }]
    });
  });

  it("clips holiday date keys to a requested attendance or leave range", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { startDate: new Date("2026-08-01"), endDate: new Date("2026-08-12") },
      { startDate: new Date("2026-08-14"), endDate: new Date("2026-08-20") }
    ]);
    const client = { academicCalendarEntry: { findMany } } as unknown as PrismaClient;
    const keys = await listCalendarDateKeysForRange(client, {
      tenantId: "00000000-0000-4000-8000-000000000005",
      institutionId,
      branchId,
      startDate: new Date("2026-08-10"),
      endDate: new Date("2026-08-15"),
      audience: "TEACHING_STAFF"
    });

    expect([...keys]).toEqual(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-14", "2026-08-15"]);
  });

  it("grants calendar governance to principals without granting it to teachers or staff", () => {
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).toContain("campuscore.calendar.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).not.toContain("campuscore.calendar.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain("campuscore.calendar.manage");
  });

  it("persists tenant-safe synchronization, RLS, and audit controls", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260809120000_add_academic_calendar/migration.sql");
    const service = source("src/modules/campus-core/calendar/calendar-service.ts");
    const navigation = source("src/components/app-shell/navigation.ts");
    const studentService = source("src/modules/academia/services/student-attendance.service.ts");
    const scannerService = source("src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts");
    const correctionService = source("src/modules/staffboard-lite/services/staff-attendance.service.ts");

    expect(schema).toContain("model AcademicCalendarEntry");
    expect(schema).toContain("calendarEntryId");
    expect(migration).toContain('ALTER TABLE "academic_calendar_entries" ENABLE ROW LEVEL SECURITY');
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("tenantId: ctx.tenantId");
    expect(service).toContain("CALENDAR_ALL_BRANCH_ACCESS_REQUIRED");
    expect(service).toContain("CALENDAR_STUDENT_ATTENDANCE_CONFLICT");
    expect(service).toContain("CALENDAR_STAFF_LEAVE_CONFLICT");
    expect(service).toContain("CALENDAR_ENTRY_CREATED");
    expect(studentService).toContain("STUDENT_ATTENDANCE_HOLIDAY");
    expect(scannerService).toContain("findApplicableCalendarEntry");
    expect(scannerService).toContain("WORKED_ON_NON_WORKING_DAY");
    expect(correctionService).toContain("STAFF_ATTENDANCE_MANAGED_BY_CALENDAR");
    expect(navigation).toContain('href: "/campus-core/calendar"');
    expect(navigation).toContain('permissions: ["campuscore.calendar.manage"]');
  });
});
