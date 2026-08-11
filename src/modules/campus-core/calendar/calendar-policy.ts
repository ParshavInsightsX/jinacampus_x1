import type { AcademicCalendarAudience, Prisma, PrismaClient } from "@prisma/client";
import { enumerateCalendarDates, calendarDateKey } from "./calendar-utils";

type DbClient = PrismaClient | Prisma.TransactionClient;

type DatePolicyInput = {
  tenantId: string;
  institutionId?: string;
  branchId: string;
  academicYearId?: string | null;
  attendanceDate: Date;
  audience: AcademicCalendarAudience;
};

export async function findApplicableCalendarEntry(
  client: DbClient,
  input: DatePolicyInput
) {
  return client.academicCalendarEntry.findFirst({
    where: {
      tenantId: input.tenantId,
      institutionId: input.institutionId,
      academicYearId: input.academicYearId ?? undefined,
      status: "ACTIVE",
      startDate: { lte: input.attendanceDate },
      endDate: { gte: input.attendanceDate },
      audiences: { has: input.audience },
      OR: [{ branchId: null }, { branchId: input.branchId }]
    },
    select: {
      id: true,
      name: true,
      entryType: true,
      startDate: true,
      endDate: true
    },
    orderBy: [{ branchId: "desc" }, { startDate: "asc" }]
  });
}

export async function listCalendarDateKeysForRange(
  client: DbClient,
  input: {
    tenantId: string;
    institutionId: string;
    branchId: string;
    startDate: Date;
    endDate: Date;
    audience: AcademicCalendarAudience;
  }
) {
  const entries = await client.academicCalendarEntry.findMany({
    where: {
      tenantId: input.tenantId,
      institutionId: input.institutionId,
      status: "ACTIVE",
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
      audiences: { has: input.audience },
      OR: [{ branchId: null }, { branchId: input.branchId }]
    },
    select: { startDate: true, endDate: true }
  });
  const keys = new Set<string>();
  for (const entry of entries) {
    const startDate = entry.startDate > input.startDate ? entry.startDate : input.startDate;
    const endDate = entry.endDate < input.endDate ? entry.endDate : input.endDate;
    enumerateCalendarDates(startDate, endDate).forEach((date) => keys.add(calendarDateKey(date)));
  }
  return keys;
}
