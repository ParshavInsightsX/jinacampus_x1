import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Coffee,
  LogIn,
  ShieldCheck,
  TimerReset,
  Users
} from "lucide-react";
import type { StaffAttendanceDailySummary } from "@/modules/staffboard-lite/queries";

const toneClasses = {
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  cyan: "bg-cyan-100 text-cyan-700",
  violet: "bg-violet-100 text-violet-700",
  slate: "bg-slate-200 text-slate-700"
} as const;

export function StaffAttendanceSummaryCards({ summary }: { summary: StaffAttendanceDailySummary }) {
  const cards = [
    { label: "Total Staff", value: summary.totalStaff, icon: Users, tone: "blue" },
    { label: "Checked In", value: summary.checkedIn, icon: LogIn, tone: "cyan" },
    { label: "Present", value: summary.present, icon: CheckCircle2, tone: "emerald" },
    { label: "Late Arrival", value: summary.late, icon: Clock3, tone: "amber" },
    { label: "Half Day", value: summary.halfDay, icon: TimerReset, tone: "violet" },
    { label: "Absent / Not Marked", value: summary.absentNotMarked, icon: AlertTriangle, tone: "rose" },
    { label: "On Leave / Paid Holiday", value: summary.onLeaveHoliday, icon: Coffee, tone: "slate" },
    { label: "Official Duty", value: summary.officialDuty, icon: BriefcaseBusiness, tone: "blue" },
    { label: "Pending Review", value: summary.pendingReview, icon: ShieldCheck, tone: "amber" }
  ] as const;

  return (
    <section aria-labelledby="staff-attendance-summary-title" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <h2 id="staff-attendance-summary-title" className="sr-only">Daily Staff Attendance summary</h2>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="attendance-glass-panel min-w-0 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[card.tone]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <p className="tabular-nums text-2xl font-semibold text-slate-950">{card.value}</p>
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{card.label}</p>
          </div>
        );
      })}
    </section>
  );
}