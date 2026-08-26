import Link from "next/link";

import type { LegalDocumentDefinition } from "@/config/legal-documents";
import { LEGAL_PUBLICATION } from "@/config/legal";

export function LegalDocumentShell({ document }: { document: LegalDocumentDefinition }) {
  const effective = document.status === "EFFECTIVE";

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <Link href="/legal" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
        Back to Legal Centre
      </Link>
      <header className="border-b border-campus-border pb-8 pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${effective ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {effective ? "Effective" : "Draft for legal review"}
          </span>
          <span className="text-xs font-semibold text-slate-500">Version {document.version}</span>
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink sm:text-4xl">{document.title}</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">{document.description}</p>
        <dl className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-slate-900">Effective date</dt>
            <dd>{document.effectiveDate ?? "Pending authorised approval"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-900">Published by</dt>
            <dd>{LEGAL_PUBLICATION.entityName ?? "Legal entity pending authorised publication"}</dd>
          </div>
        </dl>
      </header>

      {!effective ? (
        <div role="status" className="my-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This is an implementation draft. It must be reviewed by qualified Indian counsel and accepted by authorised signatories before public launch or contractual reliance.
        </div>
      ) : null}

      <div className="divide-y divide-campus-border">
        {document.sections.map((section) => (
          <section key={section.heading} className="py-8">
            <h2 className="text-xl font-semibold text-ink">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">{paragraph}</p>
            ))}
            {section.bullets ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700 sm:text-base">
                {section.bullets.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
