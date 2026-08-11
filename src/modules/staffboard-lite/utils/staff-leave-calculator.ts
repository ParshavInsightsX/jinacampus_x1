import type { StaffLeaveDuration } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dateOnlyUtc(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
export function todayForTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.get("year")), Number(values.get("month")) - 1, Number(values.get("day"))));
}

export function enumerateLeaveDates(
  startDate: Date,
  endDate: Date,
  nonWorkingWeekdays: readonly number[],
  excludedDateKeys: ReadonlySet<string> = new Set()
) {
  const start = dateOnlyUtc(startDate);
  const end = dateOnlyUtc(endDate);
  const excluded = new Set(nonWorkingWeekdays);
  const dates: Date[] = [];

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    if (!excluded.has(cursor.getUTCDay()) && !excludedDateKeys.has(formatLeaveDate(cursor))) dates.push(cursor);
  }
  return dates;
}

export function calculateStaffLeaveDays(input: {
  startDate: Date;
  endDate: Date;
  duration: StaffLeaveDuration;
  nonWorkingWeekdays: readonly number[];
  excludedDateKeys?: ReadonlySet<string>;
}) {
  const dates = enumerateLeaveDates(
    input.startDate,
    input.endDate,
    input.nonWorkingWeekdays,
    input.excludedDateKeys
  );
  if (input.duration !== "FULL_DAY") return dates.length === 1 ? 0.5 : 0;
  return dates.length;
}

export function calendarDaySpan(startDate: Date, endDate: Date) {
  return Math.floor((dateOnlyUtc(endDate).getTime() - dateOnlyUtc(startDate).getTime()) / DAY_MS) + 1;
}

export function formatLeaveDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
