import Link from "next/link";
import { CalendarClock, IdCard, QrCode } from "lucide-react";

type StaffQrSelfNavigationProps = {
  active: "card" | "today" | "history";
  canViewCard: boolean;
  canViewAttendance: boolean;
};

export function StaffQrSelfNavigation({
  active,
  canViewCard,
  canViewAttendance
}: StaffQrSelfNavigationProps) {
  const links = [
    canViewCard
      ? { key: "card" as const, href: "/staffboard/attendance/card", label: "My Staff Card", icon: IdCard }
      : null,
    canViewAttendance
      ? { key: "today" as const, href: "/staffboard/attendance/me", label: "Today", icon: QrCode }
      : null,
    canViewAttendance
      ? {
          key: "history" as const,
          href: "/staffboard/attendance/me#attendance-history",
          label: "History",
          icon: CalendarClock
        }
      : null
  ].filter((link): link is NonNullable<typeof link> => Boolean(link));

  if (links.length < 2) return null;

  return (
    <nav aria-label="My staff attendance" className="overflow-x-auto pb-1">
      <div className="attendance-glass-bar inline-flex min-w-full gap-1 p-1 sm:min-w-0">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = active === link.key;
          return (
            <Link
              key={link.key}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={
                "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold premium-focus sm:flex-none " +
                (isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
