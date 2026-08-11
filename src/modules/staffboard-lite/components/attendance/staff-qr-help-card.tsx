import { QrCode, ShieldCheck } from "lucide-react";

export function StaffQrHelpCard() {
  return (
    <aside className="space-y-4" aria-label="Staff QR attendance guidance">
      <section className="premium-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <QrCode aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-slate-950">How it works</h2>
        </div>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <li>1. Select check-in or check-out for the branch.</li>
          <li>2. Generate a five-hour QR code for display at the gate or office.</li>
          <li>3. Staff use the Scan QR page to validate the token and record attendance.</li>
        </ol>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-amber-700">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-amber-950">Security rules</h2>
        </div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-amber-900">
          <li>QR codes are time-bound and branch-scoped.</li>
          <li>Regeneration deactivates the previous code for the same purpose.</li>
          <li>Do not share outside the school premises.</li>
          <li>Raw tokens are only rendered in the QR and are not stored.</li>
        </ul>
      </section>
    </aside>
  );
}
