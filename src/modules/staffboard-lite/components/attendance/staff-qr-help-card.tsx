import { QrCode, ShieldCheck } from "lucide-react";

export function StaffQrHelpCard() {
  return (
    <aside className="space-y-4" aria-label="Staff QR attendance guidance">
      <section className="premium-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <QrCode aria-hidden="true" className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-slate-950">How supervised scanning works</h2>
        </div>
        <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <li>1. An authorised operator starts a branch-bound attendance session.</li>
          <li>2. Each staff member presents their active Staff QR Card.</li>
          <li>3. The operator scans the card to record check-in or check-out.</li>
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
          <li>Only authorised operators can open a scanning session.</li>
          <li>Cards are institution- and branch-scoped, revocable, and time-bound when configured.</li>
          <li>Staff cannot submit their own QR attendance from their account.</li>
          <li>The readable token is never displayed; only the QR symbol is rendered.</li>
        </ul>
      </section>
    </aside>
  );
}