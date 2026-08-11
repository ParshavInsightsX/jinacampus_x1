import { formatCountdown } from "./staff-qr-display-state";

type StaffQrCountdownProps = {
  secondsRemaining: number;
};

export function StaffQrCountdown({ secondsRemaining }: StaffQrCountdownProps) {
  const expired = secondsRemaining === 0;

  return (
    <div
      aria-live="polite"
      className={expired ? "rounded-lg bg-rose-50 px-4 py-3 text-center text-rose-800 sm:text-left" : "rounded-lg bg-emerald-50 px-4 py-3 text-center text-emerald-800 sm:text-left"}
    >
      <p className="text-xs font-semibold uppercase tracking-wide">{expired ? "QR expired" : "Remaining validity"}</p>
      <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{formatCountdown(secondsRemaining)}</p>
    </div>
  );
}
