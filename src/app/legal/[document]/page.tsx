import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDocumentShell } from "@/components/legal/legal-document-shell";
import {
  isLegalDocumentSlug,
  LEGAL_DOCUMENT_SLUGS,
  LEGAL_DOCUMENTS
} from "@/config/legal-documents";
import { LEGAL_PUBLICATION_READY } from "@/config/legal";

type LegalDocumentPageProps = {
  params: Promise<{ document: string }>;
};

export function generateStaticParams() {
  return LEGAL_DOCUMENT_SLUGS.map((document) => ({ document }));
}

export async function generateMetadata({ params }: LegalDocumentPageProps): Promise<Metadata> {
  const { document } = await params;
  if (!isLegalDocumentSlug(document)) return {};
  const definition = LEGAL_DOCUMENTS[document];
  return {
    title: definition.title,
    description: definition.description,
    robots: LEGAL_PUBLICATION_READY ? { index: true, follow: true } : { index: false, follow: true }
  };
}

export default async function LegalDocumentPage({ params }: LegalDocumentPageProps) {
  const { document } = await params;
  if (!isLegalDocumentSlug(document)) notFound();
  return <LegalDocumentShell document={LEGAL_DOCUMENTS[document]} />;
}
