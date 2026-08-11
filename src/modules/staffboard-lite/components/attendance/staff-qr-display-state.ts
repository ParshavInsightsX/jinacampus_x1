export const STAFF_QR_PURPOSE_OPTIONS = [
  { value: "CHECK_IN", label: "Check-in" },
  { value: "CHECK_OUT", label: "Check-out" }
] as const;

export type StaffQrPurposeOption = (typeof STAFF_QR_PURPOSE_OPTIONS)[number]["value"];
export type StaffQrDisplayStatus = "ACTIVE" | "DEACTIVATED" | "EXPIRED";

export function getSecondsRemaining(validUntil: string, now = new Date()) {
  const expiresAt = new Date(validUntil).getTime();
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - now.getTime()) / 1000));
}

export function isQrExpired(validUntil: string, now = new Date()) {
  return getSecondsRemaining(validUntil, now) === 0;
}

export function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function getQrDisplayStatus(
  storedStatus: StaffQrDisplayStatus,
  validUntil: string,
  now = new Date()
): StaffQrDisplayStatus {
  if (storedStatus !== "ACTIVE") return storedStatus;
  return isQrExpired(validUntil, now) ? "EXPIRED" : "ACTIVE";
}

export function formatQrStatus(status: StaffQrDisplayStatus) {
  if (status === "ACTIVE") return "Active";
  if (status === "DEACTIVATED") return "Deactivated";
  return "Expired";
}

export function formatValidityDuration(seconds: number) {
  if (seconds === 18_000) return "5 hours";
  const hours = seconds / 3600;
  return Number.isInteger(hours) ? `${hours} hours` : `${seconds} seconds`;
}

export function formatPurpose(value: StaffQrPurposeOption) {
  return value === "CHECK_IN" ? "Check-in" : "Check-out";
}

export function formatQrDateTime(value: string, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(new Date(value));
}
