"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSchoolCastTemplateAction,
  deactivateSchoolCastTemplateAction,
  updateSchoolCastTemplateAction,
} from "@/modules/schoolcast/actions";

type Template = {
  id: string;
  channel: string;
  templateKey: string;
  providerTemplateName: string;
  languageCode: string;
  category: string;
  isActive: boolean;
  branchId: string | null;
  updatedAt: Date | string;
  schoolCastVersions: readonly {
    id: string;
    versionNo: number;
    status: string;
    languageCode: string;
    subject: string | null;
    bodyText: string;
    variableSchemaJson: unknown;
    contentHash: string;
    createdAt: Date | string;
  }[];
};

function requiredVariables(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const required = (value as Record<string, unknown>).required;
  return Array.isArray(required)
    ? required.filter((item): item is string => typeof item === "string").join(", ")
    : "";
}

export function SchoolCastTemplateManager({
  branchId,
  templates,
  capabilities,
}: {
  branchId: string;
  templates: readonly Template[];
  capabilities: {
    canCreate: boolean;
    canUpdate: boolean;
    canActivate: boolean;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const latest = selected?.schoolCastVersions[0] ?? null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const variables = String(form.get("variableNames") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const common = {
      languageCode: form.get("languageCode"),
      subject: form.get("subject") || undefined,
      bodyText: form.get("bodyText"),
      variableNames: variables,
      activate: form.get("activate") === "on",
    };
    startTransition(async () => {
      const result = selected
        ? await updateSchoolCastTemplateAction({
            templateId: selected.id,
            providerTemplateName: form.get("providerTemplateName") || undefined,
            ...common,
          })
        : await createSchoolCastTemplateAction({
            branchId,
            channel: form.get("channel"),
            templateKey: form.get("templateKey"),
            providerTemplateName: form.get("providerTemplateName"),
            ...common,
          });
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) {
        setSelectedId(null);
        router.refresh();
      }
    });
  }

  function deactivate(templateId: string) {
    startTransition(async () => {
      const result = await deactivateSchoolCastTemplateAction({ templateId });
      setMessage(result.ok ? result.message : result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      {message ? (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {message}
        </p>
      ) : null}

      {(capabilities.canCreate || (selected && capabilities.canUpdate)) ? (
        <form key={selected?.id ?? "create"} onSubmit={submit} className="premium-card space-y-4 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink">
                {selected ? "Create new template version" : "Create provider template mapping"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Store provider identifiers and immutable content only. Provider secrets remain environment references.
              </p>
            </div>
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="premium-secondary-button min-h-11"
              >
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Channel
              <select
                name="channel"
                defaultValue={selected?.channel ?? "EMAIL"}
                disabled={pending || Boolean(selected)}
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal"
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Internal template key
              <input
                name="templateKey"
                defaultValue={selected?.templateKey ?? ""}
                required
                disabled={pending || Boolean(selected)}
                placeholder="attendance.absent"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Provider template name
              <input
                name="providerTemplateName"
                defaultValue={selected?.providerTemplateName ?? ""}
                required
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Language code
              <input
                name="languageCode"
                defaultValue={latest?.languageCode ?? selected?.languageCode ?? "en"}
                required
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
              Email subject (optional)
              <input
                name="subject"
                defaultValue={latest?.subject ?? ""}
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
              Body
              <textarea
                name="bodyText"
                defaultValue={latest?.bodyText ?? ""}
                required
                rows={7}
                disabled={pending}
                className="w-full rounded-lg border border-slate-200 p-3 font-normal leading-6"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700 md:col-span-2">
              Variable names, comma separated
              <input
                name="variableNames"
                defaultValue={requiredVariables(latest?.variableSchemaJson)}
                disabled={pending}
                placeholder="studentName, attendanceDate"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal"
              />
            </label>
          </div>
          {capabilities.canActivate ? (
            <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" name="activate" defaultChecked={selected?.isActive ?? false} disabled={pending} />
              Activate this version for future communications
            </label>
          ) : null}
          <button type="submit" disabled={pending} className="premium-primary-button min-h-11 w-full sm:w-auto">
            {pending ? "Saving..." : selected ? "Save new version" : "Create template"}
          </button>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const version = template.schoolCastVersions[0];
          return (
            <article key={template.id} className="premium-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-700">{template.channel}</p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-ink">{template.templateKey}</h3>
                </div>
                <span className={template.isActive ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-slate-400"}>
                  {template.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Provider: {template.providerTemplateName}<br />
                Latest version: {version?.versionNo ?? "None"} / {version?.status ?? "Not set"}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {capabilities.canUpdate ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setSelectedId(template.id)}
                    className="premium-secondary-button min-h-11 px-3"
                  >
                    New version
                  </button>
                ) : null}
                {template.isActive && capabilities.canActivate ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => deactivate(template.id)}
                    className="premium-secondary-button min-h-11 px-3 text-rose-700"
                  >
                    Deactivate
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}