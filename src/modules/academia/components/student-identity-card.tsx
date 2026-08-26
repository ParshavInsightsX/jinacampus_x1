"use client";

import { Building2, GraduationCap, UserRound } from "lucide-react";
import type { StudentIdentityCardData } from "@/modules/academia/services/student-identity-card.service";

function formatCardDate(value: string | null) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

function formatEnum(value: string | null) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not specified";
}

function InstitutionMark({
  logoUrl,
  institutionName
}: {
  logoUrl: string | null;
  institutionName: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-lg border border-white/70 bg-white object-contain p-1"
      />
    );
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/90 text-blue-700">
      <Building2 className="h-6 w-6" aria-hidden="true" />
      <span className="sr-only">{institutionName}</span>
    </span>
  );
}

export function StudentIdentityCard({ card }: { card: StudentIdentityCardData }) {
  return (
    <div className="identity-card-pair grid gap-4 lg:grid-cols-2" data-card-kind="student">
      <article className="identity-card-side identity-card-front" aria-label="Student identification card front">
        <header className="identity-card-brand">
          <InstitutionMark logoUrl={card.institutionLogoUrl} institutionName={card.institutionName} />
          <div className="min-w-0">
            <p className="identity-card-school-name">{card.institutionName}</p>
            <p className="identity-card-subtitle">Student Identity Card</p>
          </div>
          <GraduationCap className="ml-auto h-6 w-6 shrink-0 text-cyan-100" aria-hidden="true" />
        </header>

        <div className="identity-card-body">
          <div className="identity-card-photo">
            {card.photoUrl ? (
              <img src={card.photoUrl} alt={"Photograph of " + card.studentName} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-14 w-14 text-slate-400" aria-hidden="true" />
            )}
          </div>
          <dl className="identity-card-details">
            <div className="identity-card-name-row">
              <dt className="sr-only">Student</dt>
              <dd>{card.studentName}</dd>
            </div>
            <div><dt>Scholar No.</dt><dd>{card.admissionNumber}</dd></div>
            <div><dt>Class and Section</dt><dd>{card.classSectionName}</dd></div>
            <div><dt>Academic Year</dt><dd>{card.academicYearName}</dd></div>
            <div><dt>Date of Birth</dt><dd>{formatCardDate(card.dateOfBirth)}</dd></div>
            <div><dt>Blood Group</dt><dd>{formatEnum(card.bloodGroup)}</dd></div>
          </dl>
        </div>

        <footer className="identity-card-footer">
          <div><span>Issued</span><strong>{formatCardDate(card.issuedAt)}</strong></div>
          <div><span>Valid until</span><strong>{formatCardDate(card.validUntil)}</strong></div>
          <div className="identity-card-signature"><span>Authorised Signatory</span></div>
        </footer>
      </article>

      <article className="identity-card-side identity-card-back student-identity-card-back" aria-label="Student identification card reverse">
        <header className="identity-card-back-header">
          <div>
            <p className="identity-card-school-name">{card.institutionName}</p>
            <p className="identity-card-subtitle">Student Information and Safety</p>
          </div>
          <span className="identity-card-version">V{card.cardVersion}</span>
        </header>

        <div className="student-identity-card-back-body">
          <dl>
            <div><dt>Parent / Guardian</dt><dd>{card.guardianName ?? "Not specified"}</dd></div>
            <div><dt>Emergency Contact</dt><dd>{card.emergencyContact ?? "Contact school office"}</dd></div>
            <div><dt>Branch</dt><dd>{card.branchName} ({card.branchCode})</dd></div>
          </dl>
          <div className="identity-card-rules">
            <p className="font-semibold text-slate-950">Card rules</p>
            <ol>
              <li>This card is institution property and is non-transferable.</li>
              <li>Carry it during school activities when instructed.</li>
              <li>Report loss, damage, or unauthorised use to the school immediately.</li>
              <li>Replacement is subject to the institution's approved card policy.</li>
            </ol>
          </div>
        </div>

        <footer className="identity-card-contact">
          <span>{card.branchAddress ?? card.branchName}</span>
          <span>{card.branchContact ?? "Contact the school office for verification."}</span>
        </footer>
      </article>
    </div>
  );
}
