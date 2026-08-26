import Link from "next/link";
import { AlertTriangle, CalendarCheck2, ClipboardCheck, FileText, LockKeyhole, UsersRound } from "lucide-react";
import { academiaAttendanceRoutes } from "@/modules/academia/ui-config";

export const attendanceOverviewItems = [
  {
    title: "Mark Attendance",
    description: "Open the daily full-day class-section attendance workflow.",
    href: academiaAttendanceRoutes.mark,
    icon: ClipboardCheck
  },
  {
    title: "Attendance Coverage",
    description: "Assign temporary attendance duty and review classes that still need coverage.",
    href: academiaAttendanceRoutes.coverage,
    icon: UsersRound
  },
  {
    title: "Today's Attendance Status",
    description: "Review daily marked counts, locked status, and class-section attendance progress.",
    href: academiaAttendanceRoutes.reports,
    icon: CalendarCheck2
  },
  {
    title: "Classes Not Marked",
    description: "Find class-sections where attendance is still pending or partially marked.",
    href: academiaAttendanceRoutes.reports,
    icon: AlertTriangle
  },
  {
    title: "Corrections",
    description: "Locked records require admin or principal correction with a reason.",
    href: null,
    icon: LockKeyhole
  },
  {
    title: "Attendance Reports",
    description: "Open daily, student-wise, absence, late, and monthly percentage reports.",
    href: academiaAttendanceRoutes.reports,
    icon: FileText
  }
] as const;

export function AttendanceOverviewCards() {
  return (
    <section aria-label="Attendance workflows" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {attendanceOverviewItems.map((item) => {
        const Icon = item.icon;
        const content = (
          <div className="flex h-full flex-col gap-4">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
            </div>
          </div>
        );

        return item.href ? (
          <Link
            key={item.title}
            href={item.href}
            className="premium-card block p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_18px_42px_rgba(15,23,42,0.10)] premium-focus"
          >
            {content}
          </Link>
        ) : (
          <div key={item.title} className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5">
            {content}
          </div>
        );
      })}
    </section>
  );
}
