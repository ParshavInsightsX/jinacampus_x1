import { AppChrome } from "@/components/app-shell/app-chrome";
import { getMobileBottomNavigationItems, getVisibleNavigationGroups } from "@/components/app-shell/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { isGradebookEnabled } from "@/modules/gradebook/feature";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  const [permissions, gradebookEnabled, notificationFeature] = await Promise.all([
    getEffectivePermissions({ ctx, branchId: ctx.activeBranchId }),
    isGradebookEnabled(ctx),
    getInAppNotificationFeatureState(ctx.tenantId)
  ]);
  const notificationsEnabled = notificationFeature.enabled && permissions.has("notifications.access");
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
  const navigationGroups = getVisibleNavigationGroups(permissions, { gradebookEnabled });
  const mobileBottomItems = getMobileBottomNavigationItems(
    permissions,
    ctx.roleCodes ?? [],
    { gradebookEnabled }
  );

  return (
    <div className="min-h-dvh overflow-x-hidden bg-app-background">
      <div className="flex min-h-dvh min-w-0 flex-col">
        <AppChrome
          context={navbarContext}
          branding={branding}
          navigationGroups={navigationGroups}
          mobileBottomItems={mobileBottomItems}
          notificationsEnabled={notificationsEnabled}
        />
        <main className="mx-auto w-full max-w-[100rem] flex-1 px-3 pb-28 pt-4 sm:px-4 md:px-5 lg:px-7 lg:pb-40 lg:pt-6 xl:px-10 xl:pb-40 xl:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
