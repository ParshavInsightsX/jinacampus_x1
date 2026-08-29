"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { AuthFeedback } from "@/components/auth/auth-feedback";
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
    <section className="auth-form-panel auth-panel-padding" aria-busy={pending}>
      <p className="text-xs font-semibold text-teal-700">Principal account recovery</p>
      <h1 className="auth-form-title">Create a new password</h1>
      <p className="auth-form-description">
        Use at least 12 characters with uppercase, lowercase, a number, and a symbol.
      </p>

      {!ready ? <AuthFeedback tone="info" title="Preparing secure reset" className="mt-4">Please wait a moment.</AuthFeedback> : null}
      {ready && !credential && !notice ? (
        <AuthFeedback tone="error" title="Reset link unavailable" className="mt-4">
          This password-reset link is invalid, expired, or has already been used.
        </AuthFeedback>
      ) : null}
      {credential && !notice ? (
        <form onSubmit={submit} className="auth-form-stack">
          {error ? <AuthFeedback tone="error" title="Password not updated">{error}</AuthFeedback> : null}
          <FormField id="principal-new-password" label="New password">
            <PasswordInput
              id="principal-new-password"
              name="newPassword"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              disabled={pending}
              minLength={12}
              className={inputClassName}
            />
          </FormField>
          <FormField id="principal-confirm-password" label="Confirm new password">
            <PasswordInput
              id="principal-confirm-password"
              name="confirmNewPassword"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
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
        <AuthFeedback tone="success" title="Password updated" className="mt-4">{notice}</AuthFeedback>
      ) : null}
      <Link href="/" className="auth-secondary-navigation auth-inline-link mt-2 w-full justify-center text-slate-600 hover:text-brand-700 premium-focus">
        Back to login
      </Link>
    </section>
  );
}
