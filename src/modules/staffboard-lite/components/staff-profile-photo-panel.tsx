"use client";

import { useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";

export function StaffProfilePhotoPanel({
  staffId,
  initialHasPhoto,
  maxBytes
}: {
  staffId: string;
  initialHasPhoto: boolean;
  maxBytes: number;
}) {
  const [hasPhoto, setHasPhoto] = useState(initialHasPhoto);
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(formData: FormData) {
    if (pending) return;
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a JPEG, PNG, or WebP photograph.");
      return;
    }
    if (file.size > maxBytes) {
      setError(`The photograph must be smaller than ${Math.round(maxBytes / 1_000_000)} MB.`);
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/staffboard/staff/${staffId}/photo`, {
        method: "POST",
        body: formData
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Upload failed.");
      setHasPhoto(true);
      setRevision((value) => value + 1);
      setMessage("Staff photograph updated.");
    } catch {
      setError("Unable to upload this photograph. Check the file and storage configuration.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending || !hasPhoto || !window.confirm("Remove this staff photograph?")) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/staffboard/staff/${staffId}/photo`, { method: "DELETE" });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Delete failed.");
      setHasPhoto(false);
      setMessage("Staff photograph removed.");
    } catch {
      setError("Unable to remove this photograph.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="premium-card p-5" aria-labelledby="staff-photo-title">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Camera className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="staff-photo-title" className="text-lg font-semibold text-slate-950">Staff Photograph</h2>
          <p className="mt-1 text-sm text-slate-600">
            Used on the Staff QR Identification Card. Files remain private and are opened through short-lived access links.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[112px_minmax(0,1fr)]">
        <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          {hasPhoto ? (
            <img
              key={revision}
              src={`/api/staffboard/staff/${staffId}/photo?v=${revision}`}
              alt="Current staff passport-size photograph"
              className="h-full w-full object-cover"
            />
          ) : (
            <Camera className="h-8 w-8 text-slate-400" aria-hidden="true" />
          )}
        </div>
        <div>
          <form action={upload} className="space-y-3">
            <label className="grid gap-2 text-sm font-medium text-slate-800">
              Upload photograph
              <input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
              />
            </label>
            <p className="text-xs leading-5 text-slate-500">
              JPEG, PNG, or WebP, up to {Math.round(maxBytes / 1_000_000)} MB. Use a clear, front-facing passport-style image.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={pending} className="premium-primary-button min-h-11 gap-2 premium-focus">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {pending ? "Saving..." : hasPhoto ? "Replace Photograph" : "Upload Photograph"}
              </button>
              {hasPhoto ? (
                <button type="button" onClick={remove} disabled={pending} className="premium-danger-button min-h-11 gap-2 premium-focus">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                </button>
              ) : null}
            </div>
          </form>
          {message ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
          {error ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
