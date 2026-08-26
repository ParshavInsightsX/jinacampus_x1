import { AppChrome } from "@/components/app-shell/app-chrome";
import { getMobileBottomNavigationItems, getVisibleNavigationGroups } from "@/components/app-shell/navigation";
import { LegalLinks } from "@/components/legal/legal-links";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import {
  ATTENDANCE_ENTITLEMENT_FEATURES
} from "@/modules/campus-core/entitlements/catalog";
import { getAttendanceEntitlementState } from "@/modules/campus-core/entitlements/service";
import { isGradebookEnabled } from "@/modules/gradebook/feature";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  const [permissions, gradebookEnabled, notificationFeature, attendanceEntitlements] = await Promise.all([
    getEffectivePermissions({ ctx, branchId: ctx.activeBranchId }),
    isGradebookEnabled(ctx),
    getInAppNotificationFeatureState(ctx.tenantId),
    getAttendanceEntitlementState(ctx, { branchId: ctx.activeBranchId })
  ]);
  const notificationsEnabled = notificationFeature.enabled && permissions.has("notifications.access");
  const attendance = {
    studentAttendance: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE].read,
    staffAttendance: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE].read,
    marking: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.MARKING].write,
    qr: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.QR].write,
    reports: attendanceEntitlements.features[ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS].read
  };
  const navigationFeatures = { gradebookEnabled, attendance };
  const navbarContext = {
    userEmail: ctx.userEmail,
    userName: ctx.userName,
    hasActiveBranch: Boolean(ctx.activeBranchId),
    hasActiveAcademicYear: Boolean(ctx.activeAcademicYearId)
  };
  const branding = {
    institutionName: ctx.institutionDisplayName ?? ctx.institutionName ?? ctx.tenantName ?? "JinaCampus",
    logoUrl: ctx.institutionLogoUrl ?? null,
    branchName: ctx.activeBranchName ?? null,
    branchCode: ctx.activeBranchCode ?? null,
    academicYearName: ctx.activeAcademicYearName ?? null,
    roleLabels: ctx.roleLabels ?? []
  };
  const navigationGroups = getVisibleNavigationGroups(permissions, navigationFeatures);
  const mobileBottomItems = getMobileBottomNavigationItems(
    permissions,
    ctx.roleCodes ?? [],
    navigationFeatures
  );

  return (
    <div className="min-h-dvh overflow-x-hidden bg-app-background" data-adaptive-app-shell="jinaglass-mobile-1.0">
      <div className="flex min-h-dvh min-w-0 flex-col">
        <AppChrome
          context={navbarContext}
          branding={branding}
          navigationGroups={navigationGroups}
          mobileBottomItems={mobileBottomItems}
          notificationsEnabled={notificationsEnabled}
        />
        <main className="mobile-shell-content mx-auto w-full max-w-[100rem] flex-1 px-4 pt-4 sm:px-5 md:px-6 lg:px-7 lg:pb-40 lg:pt-6 xl:px-10 xl:pb-40 xl:pt-8" data-mobile-content="true">
          {children}
        </main>
        <footer className="mobile-shell-footer px-4 lg:pb-36">
          <LegalLinks />
        </footer>
      </div>
    </div>
  );
}
