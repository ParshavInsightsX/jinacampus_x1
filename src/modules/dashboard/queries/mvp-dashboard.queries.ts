import type { TenantContext } from "@/lib/tenant/context";
import { getAcademiaDashboardMetrics, type AcademiaDashboardMetrics } from "./academia-dashboard.queries";
import { getStudentAttendanceDashboardMetrics, type StudentAttendanceDashboardMetrics } from "./attendance-dashboard.queries";
import { getCampusCoreDashboardMetrics, type CampusCoreDashboardMetrics } from "./campuscore-dashboard.queries";
import {
  getStaffAttendanceDashboardMetrics,
  getStaffBoardDashboardMetrics,
  type StaffAttendanceDashboardMetrics,
  type StaffBoardDashboardMetrics
} from "./staffboard-dashboard.queries";

export type MvpDashboardSummary = {
  campusCore: CampusCoreDashboardMetrics;
  academia: AcademiaDashboardMetrics;
  studentAttendanceToday: StudentAttendanceDashboardMetrics;
  staffBoard: StaffBoardDashboardMetrics;
  staffAttendanceToday: StaffAttendanceDashboardMetrics;
};

export async function getMvpDashboardSummary(
  ctx: TenantContext,
  input: unknown = {}
): Promise<MvpDashboardSummary> {
  const campusCore = await getCampusCoreDashboardMetrics(ctx, input);
  const academia = await getAcademiaDashboardMetrics(ctx, input);
  const studentAttendanceToday = await getStudentAttendanceDashboardMetrics(ctx, input);
  const staffBoard = await getStaffBoardDashboardMetrics(ctx, input);
  const staffAttendanceToday = await getStaffAttendanceDashboardMetrics(ctx, input);

  return {
    campusCore,
    academia,
    studentAttendanceToday,
    staffBoard,
    staffAttendanceToday
  };
}
