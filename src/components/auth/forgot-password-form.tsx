"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { FormField } from "@/components/ui/form-primitives";
import {
  PASSWORD_RECOVERY_HELP_TEXT,
  PASSWORD_RECOVERY_PUBLIC_MESSAGE
} from "@/modules/campus-core/password-recovery-policy";

type ForgotPasswordFormProps = {
  initialSchoolId: string;
};

function normalizeSchoolCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function LoadingSpinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a9 9 0 1 1-8.2 5.3" opacity="0.28" />
      <path d="M12 3a9 9 0 0 1 8.2 5.3" />
    </svg>
  );
}

export function ForgotPasswordForm({ initialSchoolId }: ForgotPasswordFormProps) {
  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [recoveryMethod, setRecoveryMethod] = useState<"EMAIL" | "PRINCIPAL_ID">("EMAIL");
  const [email, setEmail] = useState("");
  const [principalId, setPrincipalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loginHref = schoolId ? `/?schoolId=${encodeURIComponent(normalizeSchoolCode(schoolId))}` : "/";

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const normalizedSchoolId = normalizeSchoolCode(schoolId);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPrincipalId = principalId.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    setSchoolId(normalizedSchoolId);
    setEmail(normalizedEmail);
    setPrincipalId(normalizedPrincipalId);
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/auth/forgot/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantSlug: normalizedSchoolId,
          email: recoveryMethod === "EMAIL" ? normalizedEmail : undefined,
          principalId: recoveryMethod === "PRINCIPAL_ID" ? normalizedPrincipalId : undefined
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError("Check the entered details, then try again.");
        return;
      }
      setNotice(typeof result.message === "string" ? result.message : PASSWORD_RECOVERY_PUBLIC_MESSAGE);
    } catch {
      setError("Unable to process this request. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="auth-form-panel p-5 sm:p-8 lg:p-9"
      aria-busy={pending}
      data-auth-pending={pending ? "true" : "false"}
    >
      <div className="text-left">
        <BrandLogo className="mx-auto mb-7 hidden w-[17rem] lg:block" priority />
        <p className="text-xs font-semibold text-teal-700">Account recovery</p>
        <h1 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">Forgot password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{PASSWORD_RECOVERY_HELP_TEXT}</p>
      </div>

      {!notice ? (
        <form onSubmit={requestRecovery} className="mt-7 space-y-4">
          <FormField id="recovery-school-id" label="School ID" required>
            <input
              id="recovery-school-id"
              className="auth-field-input w-full outline-none transition"
              value={schoolId}
              onChange={(event) => setSchoolId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              inputMode="text"
              autoComplete="organization"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
              required
            />
          </FormField>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Find Principal account by</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
              {([
                ["EMAIL", "Registered email"],
                ["PRINCIPAL_ID", "Principal ID"]
              ] as const).map(([value, label]) => (
                <label
                  key={value}
                  className={[
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-3 text-center text-sm font-semibold transition premium-focus",
                    recoveryMethod === value ? "bg-white text-brand-700 shadow-sm" : "text-slate-600"
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="recoveryMethod"
                    value={value}
                    checked={recoveryMethod === value}
                    onChange={() => setRecoveryMethod(value)}
                    className="sr-only"
                    disabled={pending}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {recoveryMethod === "EMAIL" ? (
            <FormField id="recovery-email" label="Registered email" required>
              <input
                id="recovery-email"
                type="email"
                className="auth-field-input w-full outline-none transition"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={pending}
                required
              />
            </FormField>
          ) : (
            <FormField
              id="recovery-principal-id"
              label="Principal ID"
              required
              helpText="Use the Principal ID assigned in the Administrator Portal."
            >
              <input
                id="recovery-principal-id"
                className="auth-field-input w-full uppercase outline-none transition"
                value={principalId}
                onChange={(event) => setPrincipalId(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={pending}
                required
              />
            </FormField>
          )}
          <button type="submit" disabled={pending} className="auth-action-button auth-action-primary premium-focus">
            {pending ? <><LoadingSpinner />Requesting help...</> : "Request password help"}
          </button>
        </form>
      ) : null}

      {notice ? (
        <p role="status" className="mt-6 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-[1rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">
          {error}
        </p>
      ) : null}

      <Link href={loginHref} className="auth-action-button auth-action-secondary mt-5 premium-focus">
        Back to login
      </Link>
    </section>
  );
}
