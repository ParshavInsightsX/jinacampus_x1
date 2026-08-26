import { NextResponse } from "next/server";
import { getSafeHttpStatus, mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import { createInstitutionRegulatoryDocumentDownloadUrl } from "@/modules/campus-core/regulatory/document.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ institutionId: string; documentId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext();
    const { institutionId, documentId } = await params;
    const signedUrl = await createInstitutionRegulatoryDocumentDownloadUrl(
      ctx,
      institutionId,
      documentId
    );
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (error) {
    const safe = mapActionError(error, {
      fallbackMessage: "Unable to open this evidence document. Please try again."
    });
    return NextResponse.json(safe, { status: getSafeHttpStatus(error) });
  }
}
