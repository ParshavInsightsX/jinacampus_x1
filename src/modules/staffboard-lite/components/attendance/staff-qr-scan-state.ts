import type { StaffQrScanActionData } from "@/modules/staffboard-lite/actions/staff-qr-scan.actions";
export { extractStaffQrToken, parseStaffAttendanceQrPayload } from "@/modules/staffboard-lite/utils/staff-qr-payload";

export function formatStaffQrPurpose(value: StaffQrScanActionData["purpose"]) {
  return value === "CHECK_IN" ? "Check-in" : "Check-out";
}

export function formatStaffAttendanceStatus(value: string) {
  const labels: Readonly<Record<string, string>> = {
    LATE: "Late Arrival",
    HOLIDAY: "Paid Holiday",
    WEEK_OFF: "Weekly Off",
    ON_LEAVE: "On Leave",
    OFFICIAL_DUTY: "Official Duty",
    HALF_DAY: "Half Day",
    INCOMPLETE: "Incomplete Attendance",
    NOT_MARKED: "Not Marked"
  };
  return labels[value] ?? value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatStaffScanDateTime(value?: string | null, timeZone?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  }).format(new Date(value));
}

export function staffQrScanErrorTitle(code: string) {
  if (code === "INVALID_STAFF_QR" || code === "VALIDATION_ERROR") return "Invalid QR code";
  if (code === "STAFF_QR_EXPIRED") return "QR code expired";
  if (code === "STAFF_QR_BRANCH_MISMATCH") return "Wrong branch";
  if (code === "STAFF_ALREADY_CHECKED_IN" || code === "STAFF_ALREADY_CHECKED_OUT") {
    return "Attendance already recorded";
  }
  if (code === "STAFF_CHECK_IN_REQUIRED") return "Check-in required";
  if (code === "ACTIVE_STAFF_PROFILE_NOT_FOUND") return "Staff profile required";
  if (code === "FORBIDDEN" || code.startsWith("FORBIDDEN_")) return "Access denied";
  if (code === "NETWORK_ERROR") return "Connection interrupted";
  return "Scan could not be completed";
}

export function staffQrScanErrorMessage(code: string, fallback: string) {
  if (code === "VALIDATION_ERROR") return "Enter a valid QR token before submitting.";
  if (code === "INVALID_STAFF_QR") return "This QR code is invalid. Ask the office to generate a fresh QR.";
  if (code === "STAFF_QR_EXPIRED") return "This QR code has expired. Ask the office to generate a new QR.";
  if (code === "STAFF_QR_BRANCH_MISMATCH") {
    return "This QR belongs to a different branch. Use the QR displayed at your assigned branch.";
  }
  if (code === "STAFF_ALREADY_CHECKED_IN") return "You have already checked in for today.";
  if (code === "STAFF_ALREADY_CHECKED_OUT") return "You have already checked out for today.";
  if (code === "STAFF_CHECK_IN_REQUIRED") return "Check-in is required before check-out.";
  if (code === "ACTIVE_STAFF_PROFILE_NOT_FOUND") return "An active staff profile was not found for your account.";
  if (code === "STAFF_BRANCH_INACTIVE") return "Your assigned branch is inactive. Contact your school administrator.";
  if (code === "STAFF_QR_ATTENDANCE_DISABLED") return "Staff QR attendance is disabled for this branch.";
  if (code === "STAFF_SELF_SCAN_DISABLED") return "Staff self check-in is not enabled for this branch. Ask the attendance operator to mark your attendance.";
  if (code === "STAFF_ATTENDANCE_HOLIDAY") return "Attendance scanning is not required on this school holiday.";
  if (code === "STAFF_ON_APPROVED_LEAVE") return "Your attendance is already covered by approved leave for today.";
  if (code === "FORBIDDEN" || code.startsWith("FORBIDDEN_PERMISSION") || code.startsWith("FORBIDDEN_")) {
    return "You do not have permission to submit staff QR attendance.";
  }
  if (code === "UNAUTHENTICATED") return "Please sign in again before scanning attendance.";
  return fallback || "Unable to submit staff QR scan.";
}
