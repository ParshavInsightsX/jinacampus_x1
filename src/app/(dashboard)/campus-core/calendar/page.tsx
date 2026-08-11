import { requireAuth } from "@/lib/auth/require-auth";
import { getAcademicCalendarPageData } from "@/modules/campus-core/calendar/calendar-queries";
import { AcademicCalendarManager } from "@/modules/campus-core/calendar/calendar-manager";

export default async function AcademicCalendarPage() {
  const ctx = await requireAuth();
  const data = await getAcademicCalendarPageData(ctx);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-brand-700">CampusCore</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Academic &amp; Institutional Calendar</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Configure authorised holidays and non-working days. Student attendance excludes these dates, while applicable staff receive paid holiday records.
        </p>
      </header>
      <AcademicCalendarManager institutions={data.institutions} entries={data.entries} />
    </div>
  );
}
