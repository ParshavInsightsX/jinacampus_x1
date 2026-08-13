"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PasswordInput } from "@/components/forms/password-input";
import { FormField } from "@/components/ui/form-primitives";

type RecoveryCredential = {
  requestId: string;
  token: string;
};

const inputClassName = "auth-field-input w-full outline-none transition";

function LoadingSpinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3a9 9 0 1 1-8.2 5.3" opacity="0.28" />
      <path d="M12 3a9 9 0 0 1 8.2 5.3" />
    </svg>
  );
}

export function PrincipalPasswordResetForm() {
  const [credential, setCredential] = useState<RecoveryCredential | null>(null);
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const requestId = fragment.get("request");
    const token = fragment.get("token");
    if (requestId && token) setCredential({ requestId, token });
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credential || pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/principal-recovery/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: credential.requestId,
          token: credential.token,
          newPassword,
          confirmNewPassword
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof result.message === "string" ? result.message : "Unable to reset the password.");
        return;
      }
      setCredential(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("Password updated. Sign in with your new password.");
    } catch {
      setError("Unable to reset the password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-form-panel p-5 sm:p-8 lg:p-9" aria-busy={pending}>
      <BrandLogo className="mx-auto mb-7 hidden w-[17rem] lg:block" priority />
      <p className="text-xs font-semibold text-teal-700">Principal account recovery</p>
      <h1 className="mt-3 text-2xl font-semibold text-ink sm:text-3xl">Create a new password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Use at least 12 characters with uppercase, lowercase, a number, and a symbol.
      </p>

      {!ready ? <p className="mt-6 text-sm text-slate-600">Preparing secure reset...</p> : null}
      {ready && !credential && !notice ? (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          This password-reset link is invalid, expired, or has already been used.
        </p>
      ) : null}
      {credential && !notice ? (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <FormField id="principal-new-password" label="New password" required>
            <PasswordInput
              id="principal-new-password"
              name="newPassword"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={pending}
              minLength={12}
              className={inputClassName}
            />
          </FormField>
          <FormField id="principal-confirm-password" label="Confirm new password" required>
            <PasswordInput
              id="principal-confirm-password"
              name="confirmNewPassword"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              autoComplete="new-password"
              required
              disabled={pending}
              minLength={12}
              className={inputClassName}
            />
          </FormField>
          <button type="submit" disabled={pending} className="auth-action-button auth-action-primary premium-focus">
            {pending ? <><LoadingSpinner />Updating password...</> : "Update password"}
          </button>
        </form>
      ) : null}

      {notice ? (
        <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <Link href="/" className="auth-action-button auth-action-secondary mt-5 premium-focus">
        Back to login
      </Link>
    </section>
  );
}
