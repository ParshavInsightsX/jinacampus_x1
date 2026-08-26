export const STAFF_ATTENDANCE_STATUS_OPTIONS = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "WEEK_OFF",
  "HOLIDAY",
  "OFFICIAL_DUTY",
  "INCOMPLETE",
  "NOT_MARKED"
] as const;

export const STAFF_ATTENDANCE_CORRECTION_STATUS_OPTIONS = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "HALF_DAY",
  "ON_LEAVE",
  "WEEK_OFF",
  "HOLIDAY",
  "OFFICIAL_DUTY"
] as const;

export const STAFF_TYPE_FILTER_OPTIONS = [
  "TEACHER",
  "ADMIN",
  "ACCOUNTANT",
  "LIBRARIAN",
  "DRIVER",
  "HELPER",
  "SECURITY",
  "PEON",
  "CLEANING_STAFF",
  "MANAGEMENT",
  "OTHER"
] as const;

const STAFF_ATTENDANCE_LABELS: Readonly<Record<string, string>> = {
  LATE: "Late Arrival",
  HOLIDAY: "Paid Holiday",
  WEEK_OFF: "Weekly Off",
  ON_LEAVE: "On Leave",
  OFFICIAL_DUTY: "Official Duty",
  HALF_DAY: "Half Day",
  NOT_MARKED: "Not Marked",
  INCOMPLETE: "Incomplete Attendance",
  SUPERVISED_STATIC_QR: "Staff QR Card",
  SELF_SERVICE_DYNAMIC_QR: "Self Check-In QR",
  APPROVED_MANUAL: "Approved Manual Entry",
  LEAVE_SYNC: "Approved Leave",
  CALENDAR_SYNC: "School Calendar"
};

export function formatStaffAttendanceLabel(value: string) {
  const knownLabel = STAFF_ATTENDANCE_LABELS[value];
  if (knownLabel) return knownLabel;
  return value
    .split("_")
    .map((part) => {
      if (part === "QR") return "QR";
      if (part === "ID") return "ID";
      return part.charAt(0) + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function formatStaffAttendanceDateTime(value?: string | null, timeZone = "Asia/Kolkata") {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("day") ?? "--"} ${values.get("month") ?? "---"}, ${values.get("hour") ?? "--"}:${values.get("minute") ?? "--"}`;
}

export function formatStaffAttendanceDate(value?: string | null, timeZone = "Asia/Kolkata") {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("day") ?? "--"} ${values.get("month") ?? "---"} ${values.get("year") ?? "----"}`;
}

export function formatWorkingMinutes(value?: number | null) {
  if (typeof value !== "number") return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, "0")}m` : `${minutes} min`;
}

export function toDateTimeLocalValue(value?: string | null, timeZone = "Asia/Kolkata") {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}`;
}

export function institutionalDateTimeLocalToIso(value: string, timeZone = "Asia/Kolkata") {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(value).toISOString();
  const desired = match.slice(1).map(Number);
  let candidate = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date(candidate));
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const observed = Date.UTC(
      Number(values.get("year")),
      Number(values.get("month")) - 1,
      Number(values.get("day")),
      Number(values.get("hour")),
      Number(values.get("minute"))
    );
    const expected = Date.UTC(desired[0], desired[1] - 1, desired[2], desired[3], desired[4]);
    candidate += expected - observed;
  }

  return new Date(candidate).toISOString();
}

export function staffAttendanceCorrectionErrorMessage(code: string, fallback: string) {
  if (code === "VALIDATION_ERROR") return "Check the correction fields and enter a reason.";
  if (code === "STAFF_ATTENDANCE_RECORD_NOT_FOUND") return "Attendance record was not found for your branch access.";
  if (code === "STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN") return "Check-out time must be after check-in time.";
  if (code === "FORBIDDEN" || code.startsWith("FORBIDDEN_PERMISSION") || code.startsWith("FORBIDDEN_")) {
    return "You do not have permission to correct staff attendance.";
  }
  return fallback || "Unable to correct staff attendance.";
}

export function validateStaffAttendanceCorrectionDraft(input: {
  correctionReason: string;
  checkInAt?: string;
  checkOutAt?: string;
}) {
  if (input.correctionReason.trim().length < 5) {
    return "Enter a correction reason with at least 5 characters.";
  }

  if (input.checkInAt && input.checkOutAt) {
    const checkInAt = new Date(input.checkInAt);
    const checkOutAt = new Date(input.checkOutAt);
    if (checkOutAt < checkInAt) return "Check-out time must be after check-in time.";
  }

  return null;
}
