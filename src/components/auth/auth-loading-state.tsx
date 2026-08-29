import { AppMark } from "@/components/brand/app-mark";
import { AuthShell, type AuthShellVariant } from "@/components/auth/auth-shell";

export function AuthLoadingState({
  variant = "school",
  label = "Preparing secure sign in"
}: {
  variant?: AuthShellVariant;
  label?: string;
}) {
  return (
    <AuthShell variant={variant}>
      <section className="auth-form-panel auth-panel-padding flex min-h-72 w-full flex-col items-center justify-center text-center" aria-live="polite" aria-busy="true">
        <div className="auth-loading-mark relative flex h-20 w-20 items-center justify-center rounded-full border border-brand-100 bg-white shadow-lg">
          <span className="auth-loading-ring absolute inset-2 rounded-full border-2 border-brand-100 border-t-brand-500" aria-hidden="true" />
          <AppMark className="relative h-10 w-10" priority />
        </div>
        <p className="mt-6 text-lg font-semibold text-ink">{label}</p>
        <p className="mt-2 text-sm text-slate-500">Please wait a moment.</p>
      </section>
    </AuthShell>
  );
}
