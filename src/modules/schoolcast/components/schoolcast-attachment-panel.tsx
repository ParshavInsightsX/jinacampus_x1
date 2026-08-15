"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Attachment = {
  id: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: string;
  createdAt: Date | string;
};

function sizeLabel(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

type AttachmentTarget =
  | { communicationId: string; homeworkItemId?: never }
  | { homeworkItemId: string; communicationId?: never };

export function SchoolCastAttachmentPanel({
  attachments,
  canUpload,
  maxBytes,
  ...target
}: {
  attachments: readonly Attachment[];
  canUpload: boolean;
  maxBytes: number;
} & AttachmentTarget) {
  const router = useRouter();
  const basePath = "communicationId" in target
    ? "/api/schoolcast/communications/" + target.communicationId + "/attachments"
    : "/api/schoolcast/homework/" + target.homeworkItemId + "/attachments";
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload() {
    if (!file) {
      setMessage("Choose a supported document or image first.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        basePath,
        { method: "POST", body },
      );
      const result = await response.json() as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Unable to upload this attachment.");
      }
      setFile(null);
      setMessage(
        "Attachment uploaded to private storage. Publication remains blocked until the file is marked safe by the configured scanner.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to upload this attachment.",
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(attachmentId: string) {
    if (!window.confirm("Delete this draft attachment? This action is audited.")) {
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        basePath + "/" + attachmentId,
        { method: "DELETE" },
      );
      const result = await response.json() as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Unable to delete this attachment.");
      }
      setMessage("Draft attachment deleted.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete this attachment.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="premium-card p-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Private attachments</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Files are signature-validated, tenant-scoped, and served only through
          short-lived authorised links. Pending files cannot be published.
        </p>
      </div>

      {canUpload ? (
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-semibold text-slate-700">
            File
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx"
              disabled={pending}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal"
            />
          </label>
          <button
            type="button"
            onClick={upload}
            disabled={pending || !file}
            className="premium-primary-button min-h-11"
          >
            {pending ? "Uploading..." : "Upload"}
          </button>
          <p className="text-xs text-slate-500 sm:col-span-2">
            PDF, JPEG, PNG, WebP, DOCX, or XLSX up to {(maxBytes / (1024 * 1024)).toFixed(1)} MB.
          </p>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {attachments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No attachments have been added.
          </p>
        ) : attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {attachment.originalFileName}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {sizeLabel(attachment.sizeBytes)} / Scan: {attachment.scanStatus}
              </p>
            </div>
            <div className="flex gap-2">
              {attachment.scanStatus === "SAFE" ? (
                <a
                  href={basePath + "/" + attachment.id}
                  target="_blank"
                  rel="noreferrer"
                  className="premium-secondary-button min-h-11 px-3"
                >
                  Open
                </a>
              ) : null}
              {canUpload ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(attachment.id)}
                  className="min-h-11 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}