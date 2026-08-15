"use server";

import { revalidatePath } from "next/cache";

import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  archiveSchoolCastCommunication,
  cancelSchoolCastCommunication,
  createSchoolCastCommunication,
  decideSchoolCastApproval,
  publishSchoolCastCommunication,
  scheduleSchoolCastCommunication,
  submitSchoolCastCommunication,
  updateSchoolCastCommunication
} from "@/modules/schoolcast/services/communication.service";
import {
  cancelSchoolCastHomework,
  createSchoolCastHomework,
  resendSchoolCastHomework,
  submitSchoolCastHomework,
  updateSchoolCastHomework
} from "@/modules/schoolcast/services/homework.service";
import {
  requeueSchoolCastOutbox,
  requeueSchoolCastWorkerEvent
} from "@/modules/schoolcast/services/delivery-operations.service";
import {
  acknowledgeSchoolCastCommunication,
  markSchoolCastInboxRead
} from "@/modules/schoolcast/services/inbox.service";
import {
  recordOwnSchoolCastConsent,
  updateOwnSchoolCastPreference
} from "@/modules/schoolcast/services/preference.service";
import {
  createSchoolCastProviderConfiguration,
  testSchoolCastProviderConfiguration,
  updateSchoolCastFeatureSettings
} from "@/modules/schoolcast/services/settings.service";
import {
  createSchoolCastTemplate,
  deactivateSchoolCastTemplate,
  updateSchoolCastTemplate
} from "@/modules/schoolcast/services/template.service";

export type SchoolCastActionResult<T = Record<string, unknown>> =
  | { ok: true; message: string; data: T }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

function actionError(error: unknown): SchoolCastActionResult<never> {
  return mapActionError(error, {
    fallbackMessage: "Unable to complete the SchoolCast action. Please try again.",
    validationMessage: "Review the communication details and correct the highlighted fields."
  });
}

function revalidateSchoolCast(...extra: string[]) {
  for (const path of new Set([
    "/schoolcast",
    "/schoolcast/communications",
    "/schoolcast/approvals",
    "/schoolcast/homework",
    "/schoolcast/templates",
    "/schoolcast/delivery",
    "/schoolcast/analytics",
    "/schoolcast/settings",
    "/notifications",
    ...extra
  ])) revalidatePath(path);
}

async function runAction<T>(
  work: () => Promise<T>,
  message: string,
  map: (value: T) => Record<string, unknown>,
  paths: readonly string[] = []
): Promise<SchoolCastActionResult> {
  try {
    const value = await work();
    revalidateSchoolCast(...paths);
    return { ok: true, message, data: map(value) };
  } catch (error) {
    return actionError(error);
  }
}

export async function createSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => createSchoolCastCommunication(await getTenantContext(), input),
    "Communication saved as a draft.",
    (value) => value
  );
}

export async function updateSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => updateSchoolCastCommunication(await getTenantContext(), input),
    "A new communication version was saved.",
    (value) => value,
    [typeof input === "object" && input && "communicationId" in input ? `/schoolcast/communications/${String(input.communicationId)}` : "/schoolcast/communications"]
  );
}

export async function submitSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => submitSchoolCastCommunication(await getTenantContext(), input),
    "Communication submitted for the configured approval workflow.",
    (value) => value
  );
}

export async function decideSchoolCastApprovalAction(input: unknown) {
  return runAction(
    async () => decideSchoolCastApproval(await getTenantContext(), input),
    "Approval decision recorded.",
    (value) => value
  );
}

export async function publishSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => publishSchoolCastCommunication(await getTenantContext(), input),
    "Communication published and eligible deliveries queued.",
    (value) => value
  );
}

export async function scheduleSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => scheduleSchoolCastCommunication(await getTenantContext(), input),
    "Communication scheduled in the institution time zone.",
    (value) => ({ ...value, scheduledAtUtc: value.scheduledAtUtc?.toISOString() ?? null })
  );
}

export async function cancelSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => cancelSchoolCastCommunication(await getTenantContext(), input),
    "Pending communication delivery cancelled.",
    (value) => value
  );
}

export async function archiveSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => archiveSchoolCastCommunication(await getTenantContext(), input),
    "Communication archived.",
    (value) => ({ ...value, archivedAt: value.archivedAt.toISOString() })
  );
}

export type SchoolCastDeliveryActionState = {
  ok: boolean;
  message?: string;
};

export async function requeueSchoolCastOutboxAction(
  _state: SchoolCastDeliveryActionState,
  formData: FormData
): Promise<SchoolCastDeliveryActionState> {
  try {
    await requeueSchoolCastOutbox(await getTenantContext(), {
      outboxId: formData.get("outboxId"),
      reason: formData.get("reason")
    });
    revalidateSchoolCast("/schoolcast/delivery");
    return { ok: true, message: "Delivery returned to the queue for a controlled retry." };
  } catch (error) {
    const mapped = mapActionError(error, {
      fallbackMessage: "Unable to retry this delivery.",
      validationMessage: "Provide a clear retry reason and try again."
    });
    return { ok: false, message: mapped.error };
  }
}
export async function requeueSchoolCastWorkerEventAction(
  _state: SchoolCastDeliveryActionState,
  formData: FormData
): Promise<SchoolCastDeliveryActionState> {
  try {
    await requeueSchoolCastWorkerEvent(await getTenantContext(), {
      eventId: formData.get("eventId"),
      kind: formData.get("kind"),
      reason: formData.get("reason")
    });
    revalidateSchoolCast("/schoolcast/delivery");
    return { ok: true, message: "Integration event returned to the worker queue." };
  } catch (error) {
    const mapped = mapActionError(error, {
      fallbackMessage: "Unable to retry this integration event.",
      validationMessage: "Provide a clear retry reason and try again."
    });
    return { ok: false, message: mapped.error };
  }
}
export async function createSchoolCastHomeworkAction(input: unknown) {
  return runAction(
    async () => createSchoolCastHomework(await getTenantContext(), input),
    "Homework or classwork saved as a draft.",
    (value) => value
  );
}

export async function updateSchoolCastHomeworkAction(input: unknown) {
  return runAction(
    async () => updateSchoolCastHomework(await getTenantContext(), input),
    "Homework or classwork updated as a new version.",
    (value) => value
  );
}

export async function submitSchoolCastHomeworkAction(input: unknown) {
  return runAction(
    async () => submitSchoolCastHomework(await getTenantContext(), input),
    "Homework or classwork entered the configured publication workflow.",
    (value) => value
  );
}

export async function cancelSchoolCastHomeworkAction(input: unknown) {
  return runAction(
    async () => cancelSchoolCastHomework(await getTenantContext(), input),
    "Homework or classwork cancelled.",
    (value) => value
  );
}

export async function resendSchoolCastHomeworkAction(input: unknown) {
  return runAction(
    async () => resendSchoolCastHomework(await getTenantContext(), input),
    "A new immutable version was prepared and resent.",
    (value) => value
  );
}

export async function markSchoolCastInboxReadAction(input: unknown) {
  return runAction(
    async () => markSchoolCastInboxRead(await getTenantContext(), input),
    "Notification marked as read.",
    (value) => ({ ...value, readAt: value.readAt.toISOString() })
  );
}

export async function acknowledgeSchoolCastCommunicationAction(input: unknown) {
  return runAction(
    async () => acknowledgeSchoolCastCommunication(await getTenantContext(), input),
    "Acknowledgement recorded.",
    (value) => ({ ...value, acknowledgedAt: value.acknowledgedAt.toISOString() })
  );
}

export async function updateOwnSchoolCastPreferenceAction(input: unknown) {
  return runAction(
    async () => updateOwnSchoolCastPreference(await getTenantContext(), input),
    "Communication preferences updated.",
    (value) => value
  );
}

export async function recordOwnSchoolCastConsentAction(input: unknown) {
  return runAction(
    async () => recordOwnSchoolCastConsent(await getTenantContext(), input),
    "Communication consent updated.",
    (value) => value
  );
}

export async function updateSchoolCastFeatureSettingsAction(input: unknown) {
  return runAction(
    async () => updateSchoolCastFeatureSettings(await getTenantContext(), input),
    "SchoolCast pilot settings updated.",
    (value) => value
  );
}

export async function createSchoolCastProviderConfigurationAction(input: unknown) {
  return runAction(
    async () => createSchoolCastProviderConfiguration(await getTenantContext(), input),
    "Provider reference saved without exposing credentials.",
    (value) => value
  );
}

export async function testSchoolCastProviderConfigurationAction(input: unknown) {
  return runAction(
    async () => testSchoolCastProviderConfiguration(await getTenantContext(), input),
    "Provider readiness check completed.",
    (value) => value
  );
}
export async function createSchoolCastTemplateAction(input: unknown) {
  return runAction(
    async () => createSchoolCastTemplate(await getTenantContext(), input),
    "Template saved with an immutable first version.",
    (value) => value
  );
}

export async function updateSchoolCastTemplateAction(input: unknown) {
  return runAction(
    async () => updateSchoolCastTemplate(await getTenantContext(), input),
    "A new immutable template version was saved.",
    (value) => value
  );
}

export async function deactivateSchoolCastTemplateAction(input: unknown) {
  return runAction(
    async () => deactivateSchoolCastTemplate(await getTenantContext(), input),
    "Template deactivated for future communications.",
    (value) => value
  );
}
