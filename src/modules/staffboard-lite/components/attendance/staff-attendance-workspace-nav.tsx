import Link from "next/link";
import {
  CalendarCheck2,
  ClipboardCheck,
  History,
  IdCard,
  ScanLine,
  UserRoundCheck
} from "lucide-react";

type AttendanceWorkspaceKey = "register" | "scan" | "credentials" | "card" | "adjustments" | "reports" | "mine";

type StaffAttendanceWorkspaceNavProps = {
  active: AttendanceWorkspaceKey;
  canViewRegister?: boolean;
  canScan?: boolean;
  canManageCredentials?: boolean;

  canViewCard?: boolean;
  canReviewAdjustments?: boolean;
  canViewReports?: boolean;
  canViewMine?: boolean;
};

const items = [
  { key: "register", label: "Attendance Register", href: "/staffboard/attendance", icon: CalendarCheck2, permission: "canViewRegister" },
  { key: "scan", label: "Staff Attendance", href: "/staffboard/attendance/scan", icon: ScanLine, permission: "canScan" },
  { key: "credentials", label: "Staff QR Cards", href: "/staffboard/attendance/credentials", icon: IdCard, permission: "canManageCredentials" },
  { key: "card", label: "My Attendance", href: "/staffboard/attendance/card", icon: IdCard, permission: "canViewCard" },
  { key: "adjustments", label: "Attendance Corrections", href: "/staffboard/attendance/adjustments", icon: ClipboardCheck, permission: "canReviewAdjustments" },
  { key: "reports", label: "Reports", href: "/staffboard/attendance/reports", icon: History, permission: "canViewReports" },
  { key: "mine", label: "Attendance History", href: "/staffboard/attendance/me", icon: UserRoundCheck, permission: "canViewMine" }
] as const;

export function StaffAttendanceWorkspaceNav(props: StaffAttendanceWorkspaceNavProps) {
  const visible = items.filter((item) => props[item.permission]);
  if (visible.length < 2) return null;

  return (
    <nav aria-label="Staff Attendance" className="attendance-glass-bar overflow-x-auto p-1.5">
      <div className="flex min-w-max items-center gap-1">
        {visible.map((item) => {
          const Icon = item.icon;
          const selected = item.key === props.active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={selected
                ? "inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-sm font-semibold text-white shadow-sm premium-focus"
                : "inline-flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-white/80 hover:text-slate-950 premium-focus"}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
