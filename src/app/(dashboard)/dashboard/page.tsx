import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  LayoutList,
  ListX,
  LogIn,
  ShieldCheck,
  UserRoundCheck,
  UserRoundCog,
  UsersRound
} from "lucide-react";
import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { getNavigationAudience } from "@/components/app-shell/navigation";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { getAttendanceEntitlementState } from "@/modules/campus-core/entitlements/service";
import { getMobileStaffAttendanceStatus } from "@/lib/mobile-api/staff-attendance";
import {
  DashboardAttentionPanel,
  DashboardEmptyState,
  DashboardMetricGroup,
  DashboardMetricCard,
  DashboardPageHeader,
  DashboardQuickActions,
  DashboardSection,
  DashboardStatusMix,
  DashboardTrendChart,
  canViewDashboard,
  canViewDashboardSection,
  formatDashboardDate,
  getVisibleDashboardQuickActions,
  getVisibleAdminMobileActions,
  ADMIN_MOBILE_OPERATIONS,
  ADMIN_MOBILE_TOOLS,
  type DashboardAttentionItem
} from "@/modules/dashboard/components";
import {
  getAcademiaDashboardMetrics,
  getCampusCoreDashboardMetrics,
  getStaffAttendanceDashboardMetrics,
  getStaffAttendanceDashboardTrend,
  getStaffBoardDashboardMetrics,
  getStudentAttendanceDashboardMetrics,
  getStudentAttendanceDashboardTrend,
  type AcademiaDashboardMetrics,
  type CampusCoreDashboardMetrics,
  type DashboardAttendanceTrendPoint,
  type StaffAttendanceDashboardMetrics,
  type StaffBoardDashboardMetrics,
  type StudentAttendanceDashboardMetrics
} from "@/modules/dashboard/queries";
import { MobileDashboard } from "@/modules/dashboard/components/mobile-dashboard";

async function safeLoad<T>(enabled: boolean, load: () => Promise<T>): Promise<PromiseSettledResult<T | null>> {
  if (!enabled) return { status: "fulfilled", value: null };
  try {
    return { status: "fulfilled", value: await load() };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

function loadDashboardPair<A, B>(first: () => Promise<A>, second: () => Promise<B>) {
  return Promise.all([first(), second()]);
}

function settledValue<T>(result: PromiseSettledResult<T | null>) {
  return result.status === "fulfilled" ? result.value : null;
}

function branchContextLabel(ctx: TenantContext) {
  if (ctx.activeBranchName) {
    return `${ctx.activeBranchName}${ctx.activeBranchCode ? ` (${ctx.activeBranchCode})` : ""}`;
  }
  if (ctx.activeBranchId) return "Current branch";
  if (ctx.accessibleBranchIds.length > 0) return `${ctx.accessibleBranchIds.length} accessible branches`;
  return "No branch access";
}

function hasQueryFailure(results: readonly PromiseSettledResult<unknown>[]) {
  return results.some((result) => result.status === "rejected");
}

function formatDashboardTime(value: string | null, timeZone?: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone ?? "Asia/Kolkata"
  }).format(new Date(value));
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.min(Math.round((value / total) * 100), 100) : null;
}

function buildAttendanceAttentionItems(
  studentAttendance: StudentAttendanceDashboardMetrics | null,
  staffAttendance: StaffAttendanceDashboardMetrics | null
) {
  const items: DashboardAttentionItem[] = [];

  if (studentAttendance && studentAttendance.absent > 0) {
    items.push({
      label: "Absent students",
      value: studentAttendance.absent,
      description: "Review the absent list and follow the school communication process.",
      tone: "rose"
    });
  }

  if (studentAttendance && studentAttendance.classesNotMarked > 0) {
    items.push({
      label: "Classes not marked",
      value: studentAttendance.classesNotMarked,
      description: "Some class-sections still need today's attendance.",
      tone: "amber"
    });
  }

  if (studentAttendance && studentAttendance.late > 0) {
    items.push({
      label: "Late students",
      value: studentAttendance.late,
      description: "Late arrivals are counted from existing attendance records.",
      tone: "amber"
    });
  }

  if (staffAttendance && staffAttendance.late > 0) {
    items.push({
      label: "Late staff",
      value: staffAttendance.late,
      description: "Check late arrivals in StaffBoard attendance if follow-up is needed.",
      tone: "amber"
    });
  }

  if (staffAttendance && staffAttendance.notMarked > 0) {
    items.push({
      label: "Staff not marked",
      value: staffAttendance.notMarked,
      description: "Active staff without a record are shown separately, not inferred as absent.",
      tone: "slate"
    });
  }

  if (staffAttendance && staffAttendance.halfDay > 0) {
    items.push({
      label: "Staff half day",
      value: staffAttendance.halfDay,
      description: "Half-day records may need admin review depending on school policy.",
      tone: "sky"
    });
  }

  return items;
}

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const [permissions, attendanceEntitlements] = await Promise.all([
    getEffectivePermissions({ ctx, branchId: ctx.activeBranchId }),
    getAttendanceEntitlementState(ctx, { branchId: ctx.activeBranchId })
  ]);
  const dateLabel = formatDashboardDate(new Date(), ctx.timeZone);
  const branchLabel = branchContextLabel(ctx);

  if (!canViewDashboard(permissions)) {
    return (
      <div className="space-y-6">
        <DashboardPageHeader activeAcademicYearName={null} branchLabel={branchLabel} dateLabel={dateLabel} timeZone={ctx.timeZone} />
        <PermissionState
          title="Dashboard unavailable"
          description="Your account does not have permission to view dashboard metrics."
        />
      </div>
    );
  }

  const attendance = {
    studentAttendance: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE].read,
    staffAttendance: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE].read,
    marking: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.MARKING].write,
    qr: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.QR].write,
    reports: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS].read
  };
  const navigationFeatures = { attendance };
  const access = {
    campusCore: canViewDashboardSection(permissions, "campusCore"),
    academia: canViewDashboardSection(permissions, "academia"),
    studentAttendance:
      attendance.studentAttendance && canViewDashboardSection(permissions, "studentAttendance"),
    staffBoard: canViewDashboardSection(permissions, "staffBoard"),
    staffAttendance:
      attendance.staffAttendance && canViewDashboardSection(permissions, "staffAttendance")
  };
  const canViewSelfAttendance =
    attendance.staffAttendance && permissions.has("staffboard.attendance.self_view");

  const [campusCoreResult, studentAttendanceTrendResult] = await loadDashboardPair(
    () => safeLoad(access.campusCore, () => getCampusCoreDashboardMetrics(ctx)),
    () => safeLoad(access.studentAttendance, () => getStudentAttendanceDashboardTrend(ctx))
  );
  const [academiaResult, staffAttendanceTrendResult] = await loadDashboardPair(
    () => safeLoad(access.academia, () => getAcademiaDashboardMetrics(ctx)),
    () => safeLoad(access.staffAttendance, () => getStaffAttendanceDashboardTrend(ctx))
  );
  const [studentAttendanceResult, staffBoardResult] = await loadDashboardPair(
    () => safeLoad(access.studentAttendance, () => getStudentAttendanceDashboardMetrics(ctx)),
    () => safeLoad(access.staffBoard, () => getStaffBoardDashboardMetrics(ctx))
  );
  const [staffAttendanceResult, selfAttendanceResult] = await loadDashboardPair(
    () => safeLoad(access.staffAttendance, () => getStaffAttendanceDashboardMetrics(ctx)),
    () => safeLoad(canViewSelfAttendance, () => getMobileStaffAttendanceStatus(ctx))
  );

  const results = [
    campusCoreResult,
    academiaResult,
    studentAttendanceResult,
    staffBoardResult,
    staffAttendanceResult,
    studentAttendanceTrendResult,
    staffAttendanceTrendResult,
    selfAttendanceResult
  ];
  const campusCore = settledValue<CampusCoreDashboardMetrics>(campusCoreResult);
  const academia = settledValue<AcademiaDashboardMetrics>(academiaResult);
  const studentAttendance = settledValue<StudentAttendanceDashboardMetrics>(studentAttendanceResult);
  const staffBoard = settledValue<StaffBoardDashboardMetrics>(staffBoardResult);
  const staffAttendance = settledValue<StaffAttendanceDashboardMetrics>(staffAttendanceResult);
  const studentAttendanceTrend = settledValue<DashboardAttendanceTrendPoint[]>(studentAttendanceTrendResult);
  const staffAttendanceTrend = settledValue<DashboardAttendanceTrendPoint[]>(staffAttendanceTrendResult);
  const selfAttendance = settledValue<Awaited<ReturnType<typeof getMobileStaffAttendanceStatus>>>(selfAttendanceResult);
  const quickActions = getVisibleDashboardQuickActions(permissions, ctx.roleCodes ?? [], navigationFeatures);
  const navigationAudience = getNavigationAudience(permissions, ctx.roleCodes ?? []);
  const adminOperations = getVisibleAdminMobileActions(permissions, ADMIN_MOBILE_OPERATIONS, navigationFeatures);
  const adminTools = getVisibleAdminMobileActions(permissions, ADMIN_MOBILE_TOOLS);
  const resolvedDateLabel = formatDashboardDate(studentAttendance?.date ?? staffAttendance?.date ?? new Date(), ctx.timeZone);
  const attentionItems = buildAttendanceAttentionItems(studentAttendance, staffAttendance);
  const queryFailure = hasQueryFailure(results);
  const studentPresenceCount = studentAttendance
    ? studentAttendance.present + studentAttendance.late + studentAttendance.halfDay
    : 0;
  const studentPresenceRate = studentAttendance ? percentage(studentPresenceCount, studentAttendance.marked) : null;
  const staffCheckInRate = staffAttendance && staffBoard
    ? percentage(staffAttendance.checkedIn, staffBoard.totalActiveStaff)
    : null;

  return (
    <div className="space-y-6">
      <MobileDashboard
        userName={ctx.userName ?? ctx.userEmail}
        audience={navigationAudience}
        adminOperations={adminOperations}
        adminTools={adminTools}
        activeAcademicYearName={campusCore?.activeAcademicYearName ?? null}
        branchLabel={branchLabel}
        campusCore={campusCore}
        academia={academia}
        studentAttendance={studentAttendance}
        studentAttendanceTrend={studentAttendanceTrend}
        staffBoard={staffBoard}
        staffAttendance={staffAttendance}
        staffAttendanceTrend={staffAttendanceTrend}
        canViewSelfAttendance={canViewSelfAttendance}
        selfAttendance={selfAttendance?.attendance ?? null}
        dateLabel={resolvedDateLabel}
        timeZone={ctx.timeZone}
        hasActiveAcademicYear={Boolean(ctx.activeAcademicYearId)}
        hasBranchAccess={ctx.accessibleBranchIds.length > 0}
        hasQueryFailure={queryFailure}
        attentionItems={attentionItems}
        quickActions={quickActions}
      />

      <div className="hidden space-y-6 lg:block" data-desktop-dashboard="true">
        <DashboardPageHeader
          userName={ctx.userName ?? ctx.userEmail}
          activeAcademicYearName={campusCore?.activeAcademicYearName ?? null}
          branchLabel={branchLabel}
          dateLabel={resolvedDateLabel}
          timeZone={ctx.timeZone}
        />

        {queryFailure ? (
          <DashboardEmptyState
            title="Dashboard data unavailable"
            description="Some dashboard cards could not be loaded. No cross-tenant or unverified data is shown."
          />
        ) : null}

        {!ctx.activeAcademicYearId ? (
          <DashboardEmptyState
            title="No active academic year"
            description="Academic-year scoped attendance and enrollment metrics will stay empty until CampusCore setup has an active academic year."
          />
        ) : null}

        {ctx.accessibleBranchIds.length === 0 ? (
          <DashboardEmptyState
            title="No branch context"
            description="Branch-scoped cards will remain empty until this user receives branch access."
          />
        ) : null}

        {studentAttendance || staffAttendance || academia || staffBoard ? (
          <DashboardSection title="Today's Attendance" description="A concise operational pulse using verified records from the active school context.">
            <DashboardMetricGroup
              title="Operational Pulse"
              description="Rates use recorded attendance only and keep missing records visible as pending work."
              columnsClassName="xl:grid-cols-3 2xl:grid-cols-6"
            >
              {studentAttendance ? (
                <DashboardMetricCard
                  label="Student Presence"
                  value={studentPresenceRate === null ? "No data" : `${studentPresenceRate}%`}
                  description={`${studentPresenceCount} on-site of ${studentAttendance.marked} marked.`}
                  icon={CheckCircle2}
                  tone="emerald"
                  progress={studentPresenceRate}
                  supportingValue="Recorded presence"
                />
              ) : null}
              {staffAttendance && staffBoard ? (
                <DashboardMetricCard
                  label="Staff Checked In"
                  value={staffAttendance.checkedIn}
                  description={`${staffAttendance.checkedIn} of ${staffBoard.totalActiveStaff} active staff.`}
                  icon={LogIn}
                  tone="sky"
                  progress={staffCheckInRate}
                  supportingValue="Check-in coverage"
                />
              ) : null}
              {studentAttendance ? (
                <DashboardMetricCard
                  label="Students Marked Today"
                  value={studentAttendance.marked}
                  description="Full-day attendance records submitted today."
                  icon={ClipboardCheck}
                />
              ) : null}
              {studentAttendance ? (
                <DashboardMetricCard
                  label="Classes Not Marked"
                  value={studentAttendance.classesNotMarked}
                  description={`${studentAttendance.classesMarked} of ${studentAttendance.eligibleClassSections} eligible classes complete.`}
                  icon={ListX}
                  tone="amber"
                  emphasis={studentAttendance.classesNotMarked > 0 ? "attention" : "normal"}
                  progress={studentAttendance.markingRate}
                  supportingValue="Marking completion"
                />
              ) : null}
              {academia ? (
                <DashboardMetricCard label="Active Students" value={academia.totalActiveStudents} description="Current branch-scoped student records." icon={GraduationCap} />
              ) : null}
              {staffBoard ? (
                <DashboardMetricCard label="Active Staff" value={staffBoard.totalActiveStaff} description="Teaching and non-teaching profiles." icon={BriefcaseBusiness} tone="sky" />
              ) : null}
            </DashboardMetricGroup>
          </DashboardSection>
        ) : null}

        {studentAttendance || staffAttendance ? (
          <div className="grid min-w-0 gap-5 xl:grid-cols-12" data-dashboard-visual-report="true">
            <div className="min-w-0 xl:col-span-8">
              <DashboardTrendChart
                idPrefix="desktop-attendance-trend"
                studentTrend={studentAttendanceTrend}
                staffTrend={staffAttendanceTrend}
              />
            </div>
            <div className="min-w-0 xl:col-span-4">
              <DashboardStatusMix
                studentAttendance={studentAttendance}
                staffAttendance={staffAttendance}
                staffBoard={staffBoard}
              />
            </div>
          </div>
        ) : null}

        {studentAttendance && studentAttendance.marked === 0 ? (
          <DashboardEmptyState
            title="Attendance has not been marked yet today."
            description="Use Mark Student Attendance when the selected class-section is ready. Missing student records are not counted as absent."
          />
        ) : null}

        {staffAttendance && staffAttendance.checkedIn === 0 ? (
          <DashboardEmptyState
            title="No staff check-ins recorded yet today."
            description="Staff attendance uses existing records only. Missing staff records remain visible as not marked."
          />
        ) : null}

        {attentionItems.length > 0 ? (
          <DashboardSection title="Needs Attention" description="Exceptions that may require an operational follow-up today.">
            <DashboardAttentionPanel items={attentionItems} />
          </DashboardSection>
        ) : null}

        {canViewSelfAttendance ? (
          <DashboardSection title="My Attendance" description="Your own staff attendance record for today.">
            {selfAttendance?.attendance ? (
              <DashboardMetricGroup
                title="Personal attendance"
                description="This section never includes another staff member's record."
                columnsClassName="xl:grid-cols-4"
              >
                <DashboardMetricCard
                  label="Status"
                  value={selfAttendance.attendance.status.replaceAll("_", " ")}
                  icon={ClipboardCheck}
                  tone="emerald"
                />
                <DashboardMetricCard
                  label="Check in"
                  value={formatDashboardTime(selfAttendance.attendance.checkInAt, ctx.timeZone)}
                  icon={LogIn}
                  tone="sky"
                />
                <DashboardMetricCard
                  label="Check out"
                  value={formatDashboardTime(selfAttendance.attendance.checkOutAt, ctx.timeZone)}
                  icon={Clock3}
                  tone="slate"
                />
                <DashboardMetricCard
                  label="Working minutes"
                  value={selfAttendance.attendance.workingMinutes ?? "Pending"}
                  icon={CalendarCheck2}
                  tone="amber"
                />
              </DashboardMetricGroup>
            ) : (
              <DashboardEmptyState
                title="No attendance recorded yet today."
                description="Open My Attendance to review available check-in options."
              />
            )}
          </DashboardSection>
        ) : null}

        <div className="grid min-w-0 gap-6 2xl:grid-cols-2" data-dashboard-operational-summaries="true">
          {academia ? (
          <DashboardSection title="Academics" description="Student records, enrollments, and academic setup readiness.">
            <DashboardMetricGroup
              title="Academia Summary"
              description="Core academic records for the active branch and academic year scope."
              columnsClassName="xl:grid-cols-3"
            >
              <DashboardMetricCard label="Active Students" value={academia.totalActiveStudents} icon={GraduationCap} />
              <DashboardMetricCard label="Active Enrollments" value={academia.totalActiveEnrollments} icon={UserRoundCheck} tone="emerald" />
              <DashboardMetricCard label="Classes" value={academia.totalClasses} icon={BookOpen} tone="sky" />
              <DashboardMetricCard label="Class Sections" value={academia.totalClassSections} icon={LayoutList} tone="slate" />
              <DashboardMetricCard label="Guardians" value={academia.totalGuardians} icon={UsersRound} tone="amber" />
            </DashboardMetricGroup>
          </DashboardSection>
          ) : null}

          {staffBoard ? (
          <DashboardSection title="StaffBoard Lite" description="Active staff profile coverage across teaching and non-teaching categories.">
            <DashboardMetricGroup
              title="StaffBoard Summary"
              description="Staff profile coverage that supports QR attendance, correction, and reports."
              columnsClassName="xl:grid-cols-3"
            >
              <DashboardMetricCard label="Active Staff" value={staffBoard.totalActiveStaff} icon={BriefcaseBusiness} />
              <DashboardMetricCard label="Teachers" value={staffBoard.totalTeachers} icon={GraduationCap} tone="emerald" />
              <DashboardMetricCard label="Non-teaching Staff" value={staffBoard.totalNonTeachingStaff} icon={UserRoundCog} tone="sky" />
            </DashboardMetricGroup>
            {staffBoard.totalActiveStaff === 0 ? (
              <DashboardEmptyState
                title="No active staff profiles"
                description="StaffBoard cards will populate after active staff profiles are added for the current branch scope."
              />
            ) : null}
          </DashboardSection>
          ) : null}
        </div>

        {campusCore ? (
          <DashboardSection title="School Setup" description="Platform setup and tenant administration at a glance.">
            <DashboardMetricGroup
              title="CampusCore Summary"
              description="Branch, user, role, and active academic-year setup."
              columnsClassName="xl:grid-cols-4"
            >
              <DashboardMetricCard label="Branches" value={campusCore.totalBranches} icon={Building2} />
              <DashboardMetricCard
                label="Active Academic Year"
                value={campusCore.activeAcademicYearName ?? "Not set"}
                icon={CalendarDays}
                tone={campusCore.activeAcademicYearName ? "emerald" : "amber"}
              />
              <DashboardMetricCard label="Users" value={campusCore.totalUsers} icon={UsersRound} tone="sky" />
              <DashboardMetricCard label="Roles" value={campusCore.totalActiveRoles} icon={ShieldCheck} tone="slate" />
            </DashboardMetricGroup>
          </DashboardSection>
        ) : null}

        <DashboardSection title="Quick Actions" description="Shortcuts to already available operational routes.">
          <DashboardQuickActions actions={quickActions} />
        </DashboardSection>
      </div>
    </div>
  );
}
