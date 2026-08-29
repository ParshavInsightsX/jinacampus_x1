"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthFeedback } from "@/components/auth/auth-feedback";
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
        setError(response.status === 429
          ? "Too many requests. Please wait a few minutes before trying again."
          : response.status >= 500
            ? "Account recovery is temporarily unavailable. Please try again shortly."
            : "Check the entered details, then try again.");
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
      className="auth-form-panel auth-panel-padding"
      aria-busy={pending}
      data-auth-pending={pending ? "true" : "false"}
    >
      <div className="auth-form-header text-left">
        <p className="text-xs font-semibold text-teal-700">Account recovery</p>
        <h1 className="auth-form-title">Forgot password?</h1>
        <p className="auth-form-description">{PASSWORD_RECOVERY_HELP_TEXT}</p>
      </div>

      {!notice ? (
        <form onSubmit={requestRecovery} className="auth-form-stack">
          {error ? <AuthFeedback tone="error" title="Request not completed">{error}</AuthFeedback> : null}
          <FormField id="recovery-school-id" label="School ID">
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
              enterKeyHint="next"
              disabled={pending}
              required
            />
          </FormField>
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">Find Principal account by</legend>
            <div className="auth-method-switch grid grid-cols-2 gap-1 p-1">
              {([
                ["EMAIL", "Registered email"],
                ["PRINCIPAL_ID", "Principal ID"]
              ] as const).map(([value, label]) => (
                <label
                  key={value}
                  className="cursor-pointer"
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
                  <span className={`auth-method-option ${recoveryMethod === value ? "auth-method-option-active" : ""}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {recoveryMethod === "EMAIL" ? (
            <FormField id="recovery-email" label="Registered email">
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
                enterKeyHint="go"
                disabled={pending}
                required
              />
            </FormField>
          ) : (
            <FormField
              id="recovery-principal-id"
              label="Principal ID"
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
                enterKeyHint="go"
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
        <AuthFeedback tone="success" title="Request received" className="mt-4">{notice}</AuthFeedback>
      ) : null}

      <Link href={loginHref} className="auth-secondary-navigation auth-inline-link mt-2 justify-center text-slate-600 hover:text-brand-700 premium-focus">
        Back to login
      </Link>
    </section>
  );
}
