import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { JINACAMPUS_BRAND } from "@/config/brand";
import { getTenantContext } from "@/lib/tenant/context";
import { getPostLoginRedirectPath } from "@/modules/campus-core/auth-redirect";
import { getSchoolLoginBranding } from "@/modules/campus-core/tenant-login";
import { validateSchoolId } from "@/modules/campus-core/tenant-login-policy";
import { getSchoolWorkspaceAccess } from "@/modules/campus-core/workspace-access";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${JINACAMPUS_BRAND.name}, ${JINACAMPUS_BRAND.tagline}.`
};

type HomeSearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: { searchParams?: HomeSearchParams }) {
  const context = await getTenantContext({ allowPasswordChangeRequired: true }).catch(() => null);

  if (context) {
    if (context.passwordChangeRequired) redirect("/account/change-password?required=1");
    const params = searchParams ? await searchParams : {};
    const intent = firstParam(params.intent) === "attendance" ? "attendance" : "standard";
    const access = await getSchoolWorkspaceAccess(context);
    redirect(getPostLoginRedirectPath(context.roleCodes ?? [], { ...access, intent }));
  }

  const params = searchParams ? await searchParams : {};
  const requestedSchoolId = firstParam(params.schoolId) ?? firstParam(params.tenantSlug);
  const initialStatus = firstParam(params.status) === "session-expired" ? "session-expired" : null;
  const validation = validateSchoolId(requestedSchoolId);
  const schoolId = validation.ok ? validation.schoolId : null;
  const branding = schoolId
    ? await getSchoolLoginBranding(schoolId).catch(() => ({ schoolName: null, logoUrl: null }))
    : { schoolName: null, logoUrl: null };

  return (
    <AuthShell variant="school">
      <LoginForm
        schoolId={schoolId}
        schoolIdLocked={false}
        schoolName={branding.schoolName}
        logoUrl={branding.logoUrl}
        initialStatus={initialStatus}
      />
    </AuthShell>
  );
}
