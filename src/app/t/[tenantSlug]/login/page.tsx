import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSchoolLoginBranding } from "@/modules/campus-core/tenant-login";
import { normalizeSchoolId } from "@/modules/campus-core/tenant-login-policy";

type TenantLoginSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TenantLoginPage({
  params,
  searchParams
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: TenantLoginSearchParams;
}) {
  const { tenantSlug: rawSchoolId } = await params;
  const query = searchParams ? await searchParams : {};
  const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
  const schoolId = normalizeSchoolId(rawSchoolId);
  const branding = await getSchoolLoginBranding(schoolId);

  return (
    <AuthShell variant="school">
      <LoginForm
        schoolId={schoolId}
        schoolIdLocked={true}
        schoolName={branding.schoolName}
        logoUrl={branding.logoUrl}
        initialStatus={rawStatus === "session-expired" ? "session-expired" : null}
      />
    </AuthShell>
  );
}
