import type { Metadata } from "next";
import Link from "next/link";

import { LEGAL_DOCUMENT_LINKS, LEGAL_DOCUMENTS } from "@/config/legal-documents";
import { LEGAL_PUBLICATION, LEGAL_PUBLICATION_READY } from "@/config/legal";

export const metadata: Metadata = {
  title: "Legal Centre",
  description: "JinaCampus legal, privacy, data-rights, cookie, acceptable-use, and security documents.",
  robots: LEGAL_PUBLICATION_READY ? { index: true, follow: true } : { index: false, follow: true }
};

export default function LegalCentrePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="max-w-3xl">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${LEGAL_PUBLICATION_READY ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
          {LEGAL_PUBLICATION_READY ? "Approved publication" : "Draft legal pack"}
        </span>
        <h1 className="mt-5 text-3xl font-semibold text-ink sm:text-4xl">JinaCampus Legal Centre</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Public notices and operational summaries for institutions, administrators, staff, teachers, parents, guardians, students, and visitors.
        </p>
      </header>

      {!LEGAL_PUBLICATION_READY ? (
        <div role="status" className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          These documents are implementation drafts and are excluded from search indexing. Qualified Indian counsel and authorised business signatories must approve the legal entity details, contacts, terms, and effective dates before launch.
        </div>
      ) : null}

      <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-campus-border bg-campus-border sm:grid-cols-2 lg:grid-cols-3">
        {LEGAL_DOCUMENT_LINKS.map((link) => {
          const document = LEGAL_DOCUMENTS[link.href.split("/").at(-1) as keyof typeof LEGAL_DOCUMENTS];
          return (
            <Link key={link.href} href={link.href} className="min-h-40 bg-white p-5 transition hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500">
              <h2 className="text-base font-semibold text-ink">{link.label}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{document.description}</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-brand-700">Read document</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
