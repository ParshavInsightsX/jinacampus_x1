"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSchoolCastProviderConfigurationAction,
  testSchoolCastProviderConfigurationAction,
  updateSchoolCastFeatureSettingsAction,
} from "@/modules/schoolcast/actions";

type FeatureState = {
  enabled: boolean;
  inApp: boolean;
  notices: boolean;
  homework: boolean;
  approvals: boolean;
  email: boolean;
  whatsApp: boolean;
  automation: boolean;
  analytics: boolean;
  deliveryMode: "DRY_RUN" | "TEST" | "LIVE";
  teacherDirectPublish: boolean;
};

type Provider = {
  id: string;
  channel: string;
  providerCode: string;
  mode: string;
  status: string;
  senderDisplayName: string | null;
  senderIdentifierMasked: string | null;
  healthStatus: string | null;
  isDefault: boolean;
  branchId: string | null;
  updatedAt: Date | string;
};

const featureToggles = [
  ["inApp", "In-application notifications"],
  ["notices", "Notices, circulars, and broadcasts"],
  ["homework", "Everyday homework and classwork"],
  ["approvals", "Approval workflow"],
  ["email", "Email delivery"],
  ["whatsApp", "WhatsApp delivery"],
  ["automation", "Source-module automations"],
  ["analytics", "Communication analytics"],
  ["teacherDirectPublish", "Teacher direct homework publication"],
] as const;

export function SchoolCastSettingsManager({
  features,
  providers,
  institutionId,
  branchId,
  capabilities,
}: {
  features: FeatureState;
  providers: readonly Provider[];
  institutionId: string;
  branchId: string;
  capabilities: {
    canManageFeatures: boolean;
    canManageProviders: boolean;
    canTestProviders: boolean;
    canEnableLive: boolean;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [providerChannel, setProviderChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");

  function saveFeatures(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateSchoolCastFeatureSettingsAction({
        enabled: form.get("enabled") === "on",
        inApp: form.get("inApp") === "on",
        notices: form.get("notices") === "on",
        homework: form.get("homework") === "on",
        approvals: form.get("approvals") === "on",
        email: form.get("email") === "on",
        whatsApp: form.get("whatsApp") === "on",
        automation: form.get("automation") === "on",
        analytics: form.get("analytics") === "on",
        teacherDirectPublish: form.get("teacherDirectPublish") === "on",
        deliveryMode: form.get("deliveryMode"),
      });
      setMessage(result.ok ? result.message : result.error);
      router.refresh();
    });
  }

  function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createSchoolCastProviderConfigurationAction({
        institutionId,
        branchId,
        channel: providerChannel,
        providerCode: providerChannel === "EMAIL" ? "RESEND" : "META_CLOUD",
        mode: form.get("mode"),
        senderDisplayName: form.get("senderDisplayName") || undefined,
        senderIdentifierMasked: form.get("senderIdentifierMasked") || undefined,
        senderAddress: providerChannel === "EMAIL" ? form.get("senderAddress") : undefined,
        phoneNumberId: providerChannel === "WHATSAPP" ? form.get("phoneNumberId") : undefined,
        apiVersion: form.get("apiVersion") || "v21.0",
        secretRef: form.get("secretRef") || undefined,
        webhookSecretRef: form.get("webhookSecretRef") || undefined,
        isDefault: form.get("isDefault") === "on",
      });
      setMessage(result.ok ? result.message : result.error);
      router.refresh();
    });
  }

  function testProvider(providerConfigId: string) {
    startTransition(async () => {
      const result = await testSchoolCastProviderConfigurationAction({ providerConfigId });
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

      <form onSubmit={saveFeatures} className="premium-card space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-ink">Pilot feature controls</h2>
          <p className="mt-1 text-sm text-slate-500">
            Feature controls are enforced by both navigation and server-side services. New tenants remain disabled by default.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" name="enabled" defaultChecked={features.enabled} disabled={pending || !capabilities.canManageFeatures} />
          SchoolCast enabled for this tenant
        </label>
        <div className="grid gap-2 md:grid-cols-2">
          {featureToggles.map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name={key}
                defaultChecked={features[key]}
                disabled={pending || !capabilities.canManageFeatures}
              />
              {label}
            </label>
          ))}
        </div>
        <label className="block max-w-sm space-y-2 text-sm font-semibold text-slate-700">
          Delivery mode
          <select
            name="deliveryMode"
            defaultValue={features.deliveryMode}
            disabled={pending || !capabilities.canManageFeatures}
            className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal"
          >
            <option value="DRY_RUN">Dry run</option>
            <option value="TEST">Provider test</option>
            {capabilities.canEnableLive ? <option value="LIVE">Live delivery</option> : null}
          </select>
        </label>
        {capabilities.canManageFeatures ? (
          <button type="submit" disabled={pending} className="premium-primary-button min-h-11">
            {pending ? "Saving..." : "Save pilot settings"}
          </button>
        ) : (
          <p className="text-sm text-slate-500">Feature controls are read-only for this role.</p>
        )}
      </form>

      {capabilities.canManageProviders ? (
        <form onSubmit={createProvider} className="premium-card space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-ink">Provider configuration reference</h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter environment variable references only. Do not enter provider secrets in this form.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Channel
              <select
                value={providerChannel}
                onChange={(event) => setProviderChannel(event.target.value as "EMAIL" | "WHATSAPP")}
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal"
              >
                <option value="EMAIL">Email / Resend</option>
                <option value="WHATSAPP">WhatsApp / Meta Cloud</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Mode
              <select name="mode" defaultValue="DRY_RUN" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-normal">
                <option value="DRY_RUN">Dry run</option>
                <option value="TEST">Provider test</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Sender display name
              <input name="senderDisplayName" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Masked sender identifier
              <input name="senderIdentifierMasked" disabled={pending} placeholder="sch***@example.test or +91******3210" className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
            </label>
            {providerChannel === "EMAIL" ? (
              <label className="space-y-2 text-sm font-semibold text-slate-700">
                Verified sender address
                <input type="email" name="senderAddress" required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
              </label>
            ) : (
              <>
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                  Meta phone number ID
                  <input name="phoneNumberId" required inputMode="numeric" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
                </label>
                <label className="space-y-2 text-sm font-semibold text-slate-700">
                  Graph API version
                  <input name="apiVersion" defaultValue="v21.0" required disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-normal" />
                </label>
              </>
            )}
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Provider secret reference
              <input name="secretRef" placeholder="env:SCHOOLCAST_PROVIDER_SECRET" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs font-normal" />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
              Webhook secret reference
              <input name="webhookSecretRef" placeholder="env:SCHOOLCAST_WEBHOOK_SECRET" disabled={pending} className="min-h-11 w-full rounded-lg border border-slate-200 px-3 font-mono text-xs font-normal" />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" name="isDefault" disabled={pending} />
            Use as the default provider for this branch and channel
          </label>
          <button type="submit" disabled={pending} className="premium-primary-button min-h-11">
            {pending ? "Saving..." : "Save provider reference"}
          </button>
        </form>
      ) : null}

      <section className="premium-card p-5">
        <h2 className="text-base font-semibold text-ink">Configured providers</h2>
        <div className="mt-4 space-y-2">
          {providers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No provider configuration has been recorded. Dry-run delivery remains available without external calls.
            </p>
          ) : providers.map((provider) => (
            <div key={provider.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {provider.channel} / {provider.providerCode} / {provider.mode}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {provider.senderIdentifierMasked ?? "Sender masked"} / {provider.healthStatus ?? "Not tested"} / {provider.status}
                </p>
              </div>
              {capabilities.canTestProviders ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => testProvider(provider.id)}
                  className="premium-secondary-button min-h-11 px-3"
                >
                  Test configuration
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}