import type { AcademicCalendarAudience, StaffType } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeCalendarDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function calendarDateKey(value: Date) {
  return normalizeCalendarDate(value).toISOString().slice(0, 10);
}

export function enumerateCalendarDates(startDate: Date, endDate: Date) {
  const dates: Date[] = [];
  const start = normalizeCalendarDate(startDate);
  const end = normalizeCalendarDate(endDate);

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    dates.push(cursor);
  }

  return dates;
}

export function staffCalendarAudience(staffType: StaffType): AcademicCalendarAudience {
  return staffType === "TEACHER" ? "TEACHING_STAFF" : "NON_TEACHING_STAFF";
}

export function hasStaffAudience(audiences: readonly AcademicCalendarAudience[]) {
  return audiences.includes("TEACHING_STAFF") || audiences.includes("NON_TEACHING_STAFF");
}

export function appliesToStaffType(
  audiences: readonly AcademicCalendarAudience[],
  staffType: StaffType
) {
  return audiences.includes(staffCalendarAudience(staffType));
}
