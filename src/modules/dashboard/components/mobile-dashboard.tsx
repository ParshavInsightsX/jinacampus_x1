import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  QrCode,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCheck,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import type { NavigationAudience } from "@/components/app-shell/navigation";
import { MobileActionCard } from "@/components/mobile/mobile-action-card";
import { MobileEmptyState } from "@/components/mobile/mobile-empty-state";
import { MobileListCard } from "@/components/mobile/mobile-list-card";
import { MobileStatCard } from "@/components/mobile/mobile-stat-card";
import type {
  AcademiaDashboardMetrics,
  CampusCoreDashboardMetrics,
  DashboardAttendanceTrendPoint,
  StaffAttendanceDashboardMetrics,
  StaffBoardDashboardMetrics,
  StudentAttendanceDashboardMetrics
} from "@/modules/dashboard/queries";

import type { DashboardAttentionItem } from "./dashboard-attention-panel";
import type { AdminMobileAction, DashboardQuickAction } from "./dashboard-state";
import { DashboardTrendChart } from "./dashboard-visualizations";
import { DashboardLiveClock } from "./dashboard-live-clock";

type MobileDashboardProps = {
  userName: string;
  audience: NavigationAudience;
  adminOperations: readonly AdminMobileAction[];
  adminTools: readonly AdminMobileAction[];
  branchLabel: string;
  dateLabel: string;
  timeZone?: string | null;
  activeAcademicYearName: string | null;
  quickActions: readonly DashboardQuickAction[];
  hasQueryFailure: boolean;
  hasActiveAcademicYear: boolean;
  hasBranchAccess: boolean;
  attentionItems: readonly DashboardAttentionItem[];
  campusCore: CampusCoreDashboardMetrics | null;
  academia: AcademiaDashboardMetrics | null;
  studentAttendance: StudentAttendanceDashboardMetrics | null;
  studentAttendanceTrend: readonly DashboardAttendanceTrendPoint[] | null;
  staffBoard: StaffBoardDashboardMetrics | null;
  staffAttendance: StaffAttendanceDashboardMetrics | null;
  staffAttendanceTrend: readonly DashboardAttendanceTrendPoint[] | null;
  canViewSelfAttendance: boolean;
  selfAttendance: {
    attendanceDate: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    workingMinutes: number | null;
  } | null;
};

const adminActionIconByLabel: Record<string, ReactNode> = {
  Attendance: <ClipboardCheck className="h-5 w-5" aria-hidden="true" />,
  Users: <UsersRound className="h-5 w-5" aria-hidden="true" />,
  Branches: <Building2 className="h-5 w-5" aria-hidden="true" />,
  "Academic Years": <CalendarDays className="h-5 w-5" aria-hidden="true" />,
  Settings: <Settings className="h-5 w-5" aria-hidden="true" />,
  "Roles & Permissions": <ShieldCheck className="h-5 w-5" aria-hidden="true" />,
  "Audit Logs": <ScrollText className="h-5 w-5" aria-hidden="true" />,
  "Tenant Settings": <Settings className="h-5 w-5" aria-hidden="true" />
};

const actionIconByLabel = {
  "Manage Students": <UsersRound className="h-5 w-5" aria-hidden="true" />,
  "Mark Student Attendance": <ClipboardCheck className="h-5 w-5" aria-hidden="true" />,
  "Student Reports": <BarChart3 className="h-5 w-5" aria-hidden="true" />,
  "Manage Staff": <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />,
  "Staff Attendance": <QrCode className="h-5 w-5" aria-hidden="true" />,
  "Staff QR Cards": <QrCode className="h-5 w-5" aria-hidden="true" />,
  "Attendance Register": <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />,
  "Attendance Reports": <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />,
  "My Attendance": <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
} satisfies Partial<Record<DashboardQuickAction["label"], ReactNode>>;

function actionTone(label: DashboardQuickAction["label"]): "indigo" | "cyan" | "green" | "amber" | "slate" {
  if (label.includes("QR")) return "cyan";
  if (label.includes("Attendance")) return "indigo";
  if (label.includes("Reports")) return "slate";
  return "green";
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.min(Math.round((value / total) * 100), 100) : null;
}

function formatSelfAttendanceTime(value: string | null, timeZone?: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? "Asia/Kolkata"
  }).format(new Date(value));
}

export function MobileDashboard({
  userName,
  audience,
  adminOperations,
  adminTools,
  branchLabel,
  dateLabel,
  timeZone,
  activeAcademicYearName,
  quickActions,
  hasQueryFailure,
  hasActiveAcademicYear,
  hasBranchAccess,
  attentionItems,
  campusCore,
  academia,
  studentAttendance,
  studentAttendanceTrend,
  staffBoard,
  staffAttendance,
  staffAttendanceTrend,
  canViewSelfAttendance,
  selfAttendance
}: MobileDashboardProps) {
  const isAdmin = audience === "admin";
  const primaryActions = quickActions.slice(0, 4);
  const fallbackActions = primaryActions.length === 0 && isAdmin ? adminOperations.slice(0, 4) : [];
  const secondaryActions = quickActions.slice(4);
  const managementActions = isAdmin ? adminOperations.filter((action) => action.label !== "Attendance") : [];
  const studentPresenceCount = studentAttendance
    ? studentAttendance.present + studentAttendance.late + studentAttendance.halfDay
    : 0;
  const studentPresenceRate = studentAttendance ? percentage(studentPresenceCount, studentAttendance.marked) : null;
  const staffCheckInRate = staffAttendance && staffBoard
    ? percentage(staffAttendance.checkedIn, staffBoard.totalActiveStaff)
    : null;

  return (
    <div className="space-y-5 lg:hidden" data-mobile-dashboard="true">
      <MobilePageHeader
        eyebrow={dateLabel}
        title={`Good day, ${userName}`}
        description={`${branchLabel} · ${activeAcademicYearName ?? "Academic year setup pending"}`}
      />
      <DashboardLiveClock timeZone={timeZone} compact />

      {hasQueryFailure ? (
        <MobileEmptyState title="Some dashboard data is unavailable" description="Only verified data for your current school context is shown." />
      ) : null}
      {!hasActiveAcademicYear ? (
        <MobileEmptyState title="No active academic year" description="Attendance and enrollment cards will stay empty until CampusCore setup is completed." />
      ) : null}
      {!hasBranchAccess ? (
        <MobileEmptyState title="No branch access" description="Ask an administrator to assign branch access before using branch-scoped workflows." />
      ) : null}

      <section className="space-y-3" aria-labelledby="mobile-primary-actions">
        <h2 id="mobile-primary-actions" className="text-base font-semibold text-slate-950">Today's Operations</h2>
        {primaryActions.length > 0 || fallbackActions.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {primaryActions.map((action) => (
              <MobileActionCard
                key={action.href}
                href={action.href}
                title={action.label}
                icon={actionIconByLabel[action.label]}
                tone={actionTone(action.label)}
                compact
              />
            ))}
            {fallbackActions.map((action) => (
              <MobileActionCard
                key={action.href}
                href={action.href}
                title={action.label}
                icon={adminActionIconByLabel[action.label]}
                tone="cyan"
                compact
              />
            ))}
          </div>
        ) : (
          <MobileEmptyState title="No quick actions available" description="Your current permissions do not include a mobile shortcut." />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="mobile-summary">
        <h2 id="mobile-summary" className="text-base font-semibold text-slate-950">Quick Stats</h2>
        <div className="grid grid-cols-2 gap-3">
          {studentAttendance ? (
            <MobileStatCard
              label="Student presence"
              value={studentPresenceRate === null ? "No data" : `${studentPresenceRate}%`}
              hint={`${studentAttendance.marked} marked`}
              icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
              progress={studentPresenceRate}
              tone="indigo"
            />
          ) : null}
          {staffAttendance && staffBoard ? (
            <MobileStatCard
              label="Staff checked in"
              value={staffAttendance.checkedIn}
              hint={`of ${staffBoard.totalActiveStaff} active`}
              icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
              progress={staffCheckInRate}
              tone="cyan"
            />
          ) : null}
          {studentAttendance ? (
            <MobileStatCard
              label="Classes pending"
              value={studentAttendance.classesNotMarked}
              hint={`${studentAttendance.classesMarked}/${studentAttendance.eligibleClassSections} complete`}
              icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
              progress={studentAttendance.markingRate}
              tone={studentAttendance.classesNotMarked > 0 ? "amber" : "green"}
            />
          ) : null}
          {academia ? (
            <MobileStatCard
              label="Active students"
              value={academia.totalActiveStudents}
              hint={`${academia.totalClassSections} class sections`}
              icon={<UsersRound className="h-4 w-4" aria-hidden="true" />}
              tone="green"
            />
          ) : null}
          {!studentAttendance && !staffAttendance && campusCore ? (
            <>
              <MobileStatCard label="Total branches" value={campusCore.totalBranches} icon={<Building2 className="h-4 w-4" aria-hidden="true" />} tone="cyan" />
              <MobileStatCard label="Total users" value={campusCore.totalUsers} icon={<UsersRound className="h-4 w-4" aria-hidden="true" />} tone="indigo" />
            </>
          ) : null}
        </div>
      </section>

      {studentAttendance || staffAttendance ? (
        <DashboardTrendChart
          idPrefix="mobile-attendance-trend"
          studentTrend={studentAttendanceTrend}
          staffTrend={staffAttendanceTrend}
          compact
        />
      ) : null}

      {canViewSelfAttendance ? (
        <section className="space-y-3" aria-labelledby="mobile-own-attendance">
          <h2 id="mobile-own-attendance" className="text-base font-semibold text-slate-950">My Attendance</h2>
          {selfAttendance ? (
            <MobileListCard
              title={selfAttendance.status.replaceAll("_", " ")}
              subtitle={`Check in ${formatSelfAttendanceTime(selfAttendance.checkInAt, timeZone)} · Check out ${formatSelfAttendanceTime(selfAttendance.checkOutAt, timeZone)}`}
              status={<ClipboardCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />}
              meta={[
                { label: "Date", value: selfAttendance.attendanceDate },
                { label: "Working minutes", value: selfAttendance.workingMinutes ?? "Pending" }
              ]}
              actions={
                <Link href="/staffboard/attendance/card" className="premium-secondary-button w-full">Open My Attendance QR</Link>
              }
            />
          ) : (
            <MobileEmptyState title="No attendance recorded yet today" description="Open My Attendance to review available check-in options." />
          )}
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="mobile-attention">
        <h2 id="mobile-attention" className="text-base font-semibold text-slate-950">Needs Attention</h2>
        {attentionItems.length > 0 ? (
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <MobileListCard
                key={item.label}
                title={item.label}
                subtitle={item.description}
                status={<span className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-amber-50 px-2 text-sm font-semibold text-amber-700">{item.value}</span>}
              />
            ))}
          </div>
        ) : (
          <MobileEmptyState title="Nothing urgent" description="No attendance exceptions need immediate action in your current context." />
        )}
      </section>

      {academia || staffBoard || campusCore ? (
        <section className="space-y-3" aria-labelledby="mobile-school-overview">
          <h2 id="mobile-school-overview" className="text-base font-semibold text-slate-950">School Overview</h2>
          <div className="space-y-3">
            {academia ? (
              <MobileListCard
                title="Academia"
                subtitle="Active student and enrollment coverage."
                status={<GraduationCap className="h-5 w-5 text-brand-600" aria-hidden="true" />}
                meta={[
                  { label: "Students", value: academia.totalActiveStudents },
                  { label: "Enrollments", value: academia.totalActiveEnrollments },
                  { label: "Class sections", value: academia.totalClassSections }
                ]}
              />
            ) : null}
            {staffBoard ? (
              <MobileListCard
                title="StaffBoard Lite"
                subtitle="Active teaching and non-teaching profiles."
                status={<BriefcaseBusiness className="h-5 w-5 text-teal-600" aria-hidden="true" />}
                meta={[
                  { label: "Active staff", value: staffBoard.totalActiveStaff },
                  { label: "Teachers", value: staffBoard.totalTeachers },
                  { label: "Non-teaching", value: staffBoard.totalNonTeachingStaff }
                ]}
              />
            ) : null}
            {campusCore ? (
              <MobileListCard
                title="School Setup"
                subtitle={campusCore.activeAcademicYearName ?? "Active academic year is not set."}
                status={<Building2 className="h-5 w-5 text-slate-600" aria-hidden="true" />}
                meta={[
                  { label: "Branches", value: campusCore.totalBranches },
                  { label: "Users", value: campusCore.totalUsers },
                  { label: "Active roles", value: campusCore.totalActiveRoles }
                ]}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {secondaryActions.length > 0 ? (
        <section className="space-y-3" aria-labelledby="mobile-more-actions">
          <h2 id="mobile-more-actions" className="text-base font-semibold text-slate-950">More Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {secondaryActions.map((action) => (
              <MobileActionCard key={action.href} href={action.href} title={action.label} icon={actionIconByLabel[action.label]} tone={actionTone(action.label)} compact />
            ))}
          </div>
        </section>
      ) : null}

      {isAdmin && (managementActions.length > 0 || adminTools.length > 0) ? (
        <section className="space-y-3" aria-labelledby="mobile-admin-tools">
          <h2 id="mobile-admin-tools" className="text-base font-semibold text-slate-950">Admin Tools</h2>
          <div className="grid grid-cols-2 gap-3">
            {[...managementActions, ...adminTools].map((action) => (
              <MobileActionCard key={`${action.label}-${action.href}`} href={action.href} title={action.label} icon={adminActionIconByLabel[action.label]} tone="slate" compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
