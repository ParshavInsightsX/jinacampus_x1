import { notFound } from "next/navigation";
import { PermissionState } from "@/components/ui/empty-state";
import { requireAdministratorContext } from "@/modules/campus-core/administrator-auth";
import { getSchoolByIdForAdministrator } from "@/modules/campus-core/administrator-services";
import { AdministratorShell } from "@/modules/campus-core/components/administrator-shell";
import {
  InstitutionLogoUploadForm,
  SchoolEditForm,
  SchoolIdUpdateForm
} from "@/modules/campus-core/components/administrator-school-forms";

type PageParams = Promise<{ tenantId: string }>;

function isNextNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).includes("NEXT_NOT_FOUND");
}

export default async function EditAdministratorSchoolPage({ params }: { params: PageParams }) {
  const ctx = await requireAdministratorContext();
  const { tenantId } = await params;

  try {
    const school = await getSchoolByIdForAdministrator(ctx, tenantId);
    if (!school) notFound();

    return (
      <AdministratorShell ctx={ctx} activeHref="/administrator/schools">
        <section className="premium-section-shell">
          <p className="premium-muted-chip">Edit School</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{school.name}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Update school profile and branding here. Use the separate School ID form only when the login code must change.
          </p>
        </section>
        <SchoolEditForm school={school} />
        <section className="space-y-4" aria-labelledby="institution-logo-upload-title">
          <div>
            <h2 id="institution-logo-upload-title" className="text-xl font-semibold text-slate-950">Institution Logos</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Upload public branding images for this school. Only signed-in JinaCampus administrators can perform this action.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {school.institutions.map((institution) => (
              <InstitutionLogoUploadForm key={institution.id} tenantId={school.id} institution={institution} />
            ))}
          </div>
        </section>
        <SchoolIdUpdateForm school={{ id: school.id, slug: school.slug }} />
      </AdministratorShell>
    );
  } catch (error) {
    if (isNextNotFound(error)) throw error;
    return (
      <AdministratorShell ctx={ctx} activeHref="/administrator/schools">
        <PermissionState
          title="School edit unavailable"
          description="Your administrator account does not have permission to edit this school."
        />
      </AdministratorShell>
    );
  }
}
