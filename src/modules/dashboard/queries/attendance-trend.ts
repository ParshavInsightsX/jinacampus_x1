export const DASHBOARD_ATTENDANCE_TREND_DAYS = 7;

export type DashboardAttendanceTrendPoint = {
  date: string;
  label: string;
  recorded: number;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  presenceRate: number | null;
};

type AttendanceStatusGroup = {
  attendanceDate: Date;
  status: string;
  _count: { _all: number };
};

const NON_WORKING_ATTENDANCE_STATUSES = new Set(["NOT_MARKED", "HOLIDAY", "WEEK_OFF"]);

function dateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function trendLabel(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  }).format(date);
}

export function getDashboardTrendDates(endDate: Date, days = DASHBOARD_ATTENDANCE_TREND_DAYS) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(endDate.getUTCDate() - (days - index - 1));
    return date;
  });
}

export function buildAttendanceTrendPoints(
  dates: readonly Date[],
  groups: readonly AttendanceStatusGroup[]
): DashboardAttendanceTrendPoint[] {
  const countsByDate = new Map<string, Map<string, number>>();

  for (const group of groups) {
    const date = dateOnlyString(group.attendanceDate);
    const statusCounts = countsByDate.get(date) ?? new Map<string, number>();
    statusCounts.set(group.status, group._count._all);
    countsByDate.set(date, statusCounts);
  }

  return dates.map((date) => {
    const dateString = dateOnlyString(date);
    const statusCounts = countsByDate.get(dateString) ?? new Map<string, number>();
    const present = statusCounts.get("PRESENT") ?? 0;
    const absent = statusCounts.get("ABSENT") ?? 0;
    const late = statusCounts.get("LATE") ?? 0;
    const halfDay = statusCounts.get("HALF_DAY") ?? 0;
    const recorded = Array.from(statusCounts.entries()).reduce(
      (total, [status, count]) => NON_WORKING_ATTENDANCE_STATUSES.has(status) ? total : total + count,
      0
    );
    const onSite = present + late + halfDay;

    return {
      date: dateString,
      label: trendLabel(date),
      recorded,
      present,
      absent,
      late,
      halfDay,
      presenceRate: recorded > 0 ? Math.round((onSite / recorded) * 100) : null
    };
  });
}
