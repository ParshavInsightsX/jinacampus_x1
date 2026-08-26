"use client";

import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { StaffAttendanceIdentityCard } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";

type StaffIdentityCardProps = {
  card: StaffAttendanceIdentityCard;
  mode: "manager" | "self";
};

function formatCardDate(value: string | null) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
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

export function StaffIdentityCard({ card, mode }: StaffIdentityCardProps) {
  return (
    <div
      className={
        "identity-card-pair grid gap-4 lg:grid-cols-2 " +
        (mode === "self" ? "identity-card-digital-only" : "")
      }
      data-card-kind="staff"
    >
      <article className="identity-card-side identity-card-front" aria-label="Staff identification card front">
        <header className="identity-card-brand">
          <InstitutionMark logoUrl={card.institutionLogoUrl} institutionName={card.institutionName} />
          <div className="min-w-0">
            <p className="identity-card-school-name">{card.institutionName}</p>
            <p className="identity-card-subtitle">Staff Identification Card</p>
          </div>
          <ShieldCheck className="ml-auto h-6 w-6 shrink-0 text-cyan-100" aria-hidden="true" />
        </header>

        <div className="identity-card-body">
          <div className="identity-card-photo">
            {card.photoUrl ? (
              <img src={card.photoUrl} alt={"Photograph of " + card.staffName} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-14 w-14 text-slate-400" aria-hidden="true" />
            )}
          </div>

          <dl className="identity-card-details">
            <div className="identity-card-name-row">
              <dt className="sr-only">Staff member</dt>
              <dd>{card.staffName}</dd>
            </div>
            <div><dt>Employee Code</dt><dd>{card.employeeCode}</dd></div>
            <div><dt>Designation</dt><dd>{card.designation ?? "Staff Member"}</dd></div>
            <div><dt>Department</dt><dd>{card.department ?? "Not specified"}</dd></div>
            <div><dt>Branch</dt><dd>{card.branchName} ({card.branchCode})</dd></div>
          </dl>
        </div>

        <footer className="identity-card-footer">
          <div><span>Issued</span><strong>{formatCardDate(card.issuedAt)}</strong></div>
          <div><span>Valid until</span><strong>{card.expiresAt ? formatCardDate(card.expiresAt) : "Until revoked"}</strong></div>
          <div className="identity-card-signature"><span>Authorised Signatory</span></div>
        </footer>
      </article>

      <article className="identity-card-side identity-card-back" aria-label="Staff attendance QR card reverse">
        <header className="identity-card-back-header">
          <div>
            <p className="identity-card-school-name">{card.institutionName}</p>
            <p className="identity-card-subtitle">Supervised Staff Attendance</p>
          </div>
          <span className="identity-card-version">V{card.credentialVersion}</span>
        </header>

        <div className="identity-card-back-body">
          <div className="identity-card-qr" aria-label={"Attendance QR code for " + card.staffName}>
            <QRCodeSVG
              value={card.qrPayload}
              size={168}
              level="H"
              marginSize={2}
              title={"Attendance QR for " + card.staffName}
            />
          </div>
          <div className="identity-card-rules">
            <p className="font-semibold text-slate-950">How to use this card</p>
            <ol>
              <li>Present it only to an authorised school attendance operator.</li>
              <li>This card is personal, non-transferable, and must not be shared.</li>
              <li>Report loss, damage, or suspected misuse to the school immediately.</li>
              <li>Lost-card replacement charge: INR 500, subject to approved school policy.</li>
            </ol>
          </div>
        </div>

        <footer className="identity-card-contact">
          <span>{card.branchAddress ?? card.branchName}</span>
          <span>{card.branchPhone ?? card.branchEmail ?? "Contact the school office for verification."}</span>
        </footer>
      </article>
    </div>
  );
}
