"use client";

import { CalendarClock, Check, X } from "lucide-react";
import {
  ATTENDANCE_CAPTURE_STATUSES,
  type AttendanceCaptureStatus
} from "./attendance-session-state";

const statusConfig = {
  PRESENT: {
    label: "Present",
    icon: Check,
    active: "border-emerald-600 bg-emerald-600 text-white",
    inactive: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400"
  },
  ABSENT: {
    label: "Absent",
    icon: X,
    active: "border-rose-600 bg-rose-600 text-white",
    inactive: "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-400"
  },
  LEAVE: {
    label: "Leave",
    icon: CalendarClock,
    active: "border-amber-600 bg-amber-600 text-white",
    inactive: "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400"
  }
} as const;

export function AttendanceStatusSegmented({
  studentName,
  value,
  disabled,
  onChange
}: {
  studentName: string;
  value: AttendanceCaptureStatus | null;
  disabled?: boolean;
  onChange: (status: AttendanceCaptureStatus) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Attendance status for ${studentName}`}
      className="grid grid-cols-3 gap-2"
    >
      {ATTENDANCE_CAPTURE_STATUSES.map((status) => {
        const config = statusConfig[status];
        const Icon = config.icon;
        const checked = value === status;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`Mark ${studentName} ${config.label}`}
            disabled={disabled}
            onClick={() => onChange(status)}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm ${checked ? config.active : config.inactive}`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.2} />
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
