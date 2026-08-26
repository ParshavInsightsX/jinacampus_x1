import type {
  StaffAttendanceFlag,
  StaffAttendanceScanMode,
  StaffAttendanceStatus
} from "@prisma/client";
import { getZonedDateTimeParts, safeTimeZone } from "@/lib/dates/time-zone";
import { calculateWorkingMinutes } from "./attendance-calculator";

export type StaffAttendanceProjectionPolicy = {
  timeZone: string;
  shiftStartTime: string;
  expectedCheckOutTime: string | null;
  graceMinutes: number;
  halfDayMinimumMinutes: number;
  fullDayMinimumMinutes: number;
  earlyDepartureGraceMinutes: number;
  checkInOnly: boolean;
};

export type StaffAttendanceProjection = {
  status: StaffAttendanceStatus;
  flags: StaffAttendanceFlag[];
  workingMinutes: number | null;
  lateMinutes: number;
  earlyDepartureMinutes: number;
};

function parseTime(value: string | null | undefined, fallback: string) {
  const candidate = value?.trim() || fallback;
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : fallback;
  const [hour, minute] = match.split(":").map(Number);
  return hour * 60 + minute;
}

function localMinuteOfDay(date: Date, timeZone: string) {
  const parts = getZonedDateTimeParts(date, safeTimeZone(timeZone));
  return parts.hour * 60 + parts.minute;
}

function uniqueFlags(flags: StaffAttendanceFlag[]) {
  return Array.from(new Set(flags));
}

export function inferNextStaffAttendanceEvent(input: {
  mode: StaffAttendanceScanMode;
  hasCheckIn: boolean;
  hasCheckOut: boolean;
}): "CHECK_IN" | "CHECK_OUT" {
  if (input.mode === "CHECK_IN" || input.mode === "CHECK_IN_ONLY") {
    if (input.hasCheckIn) throw new Error("STAFF_ALREADY_CHECKED_IN");
    return "CHECK_IN";
  }
  if (input.mode === "CHECK_OUT") {
    if (!input.hasCheckIn) throw new Error("STAFF_CHECK_IN_REQUIRED");
    if (input.hasCheckOut) throw new Error("STAFF_ALREADY_CHECKED_OUT");
    return "CHECK_OUT";
  }
  if (!input.hasCheckIn) return "CHECK_IN";
  if (!input.hasCheckOut) return "CHECK_OUT";
  throw new Error("STAFF_ATTENDANCE_ALREADY_RECORDED");
}

export function calculateStaffAttendanceProjection(input: {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  policy: StaffAttendanceProjectionPolicy;
  preserveFlags?: StaffAttendanceFlag[];
  dayClosed?: boolean;
}): StaffAttendanceProjection {
  const flags = new Set<StaffAttendanceFlag>(input.preserveFlags ?? []);
  flags.delete("LATE");
  flags.delete("EARLY_DEPARTURE");
  flags.delete("MISSING_CHECK_OUT");

  if (!input.checkInAt) {
    return {
      status: "NOT_MARKED",
      flags: uniqueFlags(Array.from(flags)),
      workingMinutes: null,
      lateMinutes: 0,
      earlyDepartureMinutes: 0
    };
  }

  const shiftStart = parseTime(input.policy.shiftStartTime, "08:00");
  const checkInMinute = localMinuteOfDay(input.checkInAt, input.policy.timeZone);
  const lateMinutes = Math.max(0, checkInMinute - shiftStart - Math.max(0, input.policy.graceMinutes));
  if (lateMinutes > 0) flags.add("LATE");

  if (!input.checkOutAt) {
    if (input.dayClosed && !input.policy.checkInOnly) flags.add("MISSING_CHECK_OUT");
    return {
      status: lateMinutes > 0 ? "LATE" : "PRESENT",
      flags: uniqueFlags(Array.from(flags)),
      workingMinutes: null,
      lateMinutes,
      earlyDepartureMinutes: 0
    };
  }

  const workingMinutes = calculateWorkingMinutes(input.checkInAt, input.checkOutAt);
  const expectedCheckOut = input.policy.expectedCheckOutTime
    ? parseTime(input.policy.expectedCheckOutTime, "16:00")
    : null;
  const checkOutMinute = localMinuteOfDay(input.checkOutAt, input.policy.timeZone);
  const earlyDepartureMinutes = expectedCheckOut === null
    ? 0
    : Math.max(0, expectedCheckOut - checkOutMinute - Math.max(0, input.policy.earlyDepartureGraceMinutes));
  if (earlyDepartureMinutes > 0) flags.add("EARLY_DEPARTURE");

  const halfDayThreshold = Math.max(0, input.policy.halfDayMinimumMinutes);
  const fullDayThreshold = Math.max(halfDayThreshold, input.policy.fullDayMinimumMinutes);
  const status: StaffAttendanceStatus = workingMinutes < fullDayThreshold
    ? "HALF_DAY"
    : lateMinutes > 0
      ? "LATE"
      : "PRESENT";

  return {
    status,
    flags: uniqueFlags(Array.from(flags)),
    workingMinutes,
    lateMinutes,
    earlyDepartureMinutes
  };
}