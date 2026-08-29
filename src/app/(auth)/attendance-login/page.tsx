import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSchoolLoginBranding } from "@/modules/campus-core/tenant-login";
import { validateSchoolId } from "@/modules/campus-core/tenant-login-policy";

type AttendanceLoginPageProps = {
  searchParams: Promise<{
    schoolId?: string | string[];
    status?: string | string[];
  }>;
};

export default async function AttendanceLoginPage({ searchParams }: AttendanceLoginPageProps) {
  const params = await searchParams;
  const rawSchoolId = Array.isArray(params.schoolId) ? params.schoolId[0] : params.schoolId;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const validatedSchoolId = validateSchoolId(rawSchoolId);
  const schoolId = validatedSchoolId.ok ? validatedSchoolId.schoolId : null;
  const branding = schoolId
    ? await getSchoolLoginBranding(schoolId).catch(() => ({ schoolName: null, logoUrl: null }))
    : { schoolName: null, logoUrl: null };

  return (
    <AuthShell variant="attendance">
      <LoginForm
        schoolId={schoolId}
        schoolIdLocked={Boolean(schoolId)}
        schoolName={branding.schoolName}
        logoUrl={branding.logoUrl}
        intent="attendance"
        successRedirect="/?intent=attendance"
        initialStatus={rawStatus === "session-expired" ? "session-expired" : null}
      />
    </AuthShell>
  );
}
