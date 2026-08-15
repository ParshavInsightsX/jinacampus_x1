import type { NotificationChannel, Prisma, SchoolCastDeliveryMode } from "@prisma/client";

import type { SchoolCastFeatureState } from "@/modules/schoolcast/feature";
import type { SchoolCastResolvedRecipient } from "@/modules/schoolcast/services/audience.service";
import {
  encryptSchoolCastContact,
  isSchoolCastContactEncryptionConfigured
} from "@/modules/schoolcast/services/contact-encryption.service";

export type SchoolCastEligibilityDecision = {
  channel: NotificationChannel;
  eligible: boolean;
  reasonCode: string | null;
  consentRecordId: string | null;
  encryptedAddress: string | null;
};

type EvaluateInput = {
  tenantId: string;
  purpose: string;
  featureState: SchoolCastFeatureState;
  recipients: readonly SchoolCastResolvedRecipient[];
  channels: readonly NotificationChannel[];
};

function purposeEnabled(preference: {
  generalNoticesEnabled: boolean;
  homeworkUpdatesEnabled: boolean;
  attendanceAlertsEnabled: boolean;
  leaveUpdatesEnabled: boolean;
  calendarRemindersEnabled: boolean;
  gradebookUpdatesEnabled: boolean;
  feeUpdatesEnabled: boolean;
}, purpose: string) {
  if (purpose === "HOMEWORK" || purpose === "CLASSWORK") return preference.homeworkUpdatesEnabled;
  if (purpose.startsWith("ATTENDANCE")) return preference.attendanceAlertsEnabled;
  if (purpose.startsWith("LEAVE")) return preference.leaveUpdatesEnabled;
  if (purpose.startsWith("CALENDAR")) return preference.calendarRemindersEnabled;
  if (purpose.startsWith("GRADEBOOK")) return preference.gradebookUpdatesEnabled;
  if (purpose.startsWith("FEEDESK")) return preference.feeUpdatesEnabled;
  return preference.generalNoticesEnabled;
}

function channelFeatureEnabled(featureState: SchoolCastFeatureState, channel: NotificationChannel) {
  if (channel === "IN_APP") return featureState.inApp;
  if (channel === "EMAIL") return featureState.email;
  return featureState.whatsApp;
}

function channelAddress(recipient: SchoolCastResolvedRecipient, channel: NotificationChannel) {
  if (channel === "EMAIL") return recipient.email;
  if (channel === "WHATSAPP") return recipient.phone;
  return recipient.userId;
}

function preferenceAllows(
  preference: { inAppEnabled: boolean; emailEnabled: boolean; whatsappEnabled: boolean },
  channel: NotificationChannel
) {
  if (channel === "IN_APP") return preference.inAppEnabled;
  if (channel === "EMAIL") return preference.emailEnabled;
  return preference.whatsappEnabled;
}

function encryptionDecision(address: string, mode: SchoolCastDeliveryMode) {
  if (mode === "DRY_RUN") return { eligible: true, encryptedAddress: null, reasonCode: null };
  if (!isSchoolCastContactEncryptionConfigured()) {
    return { eligible: false, encryptedAddress: null, reasonCode: "CONTACT_ENCRYPTION_NOT_CONFIGURED" };
  }
  return { eligible: true, encryptedAddress: encryptSchoolCastContact(address), reasonCode: null };
}

export async function evaluateSchoolCastEligibility(
  tx: Prisma.TransactionClient,
  input: EvaluateInput
) {
  const ownerPairs = input.recipients
    .filter((recipient) => recipient.preferenceOwnerType && recipient.preferenceOwnerId)
    .map((recipient) => ({ ownerType: recipient.preferenceOwnerType!, ownerId: recipient.preferenceOwnerId! }));

  const [preferences, consentRecords] = await Promise.all([
    ownerPairs.length === 0 ? [] : tx.communicationPreference.findMany({
      where: { tenantId: input.tenantId, OR: ownerPairs },
      select: {
        id: true,
        ownerType: true,
        ownerId: true,
        inAppEnabled: true,
        emailEnabled: true,
        whatsappEnabled: true,
        generalNoticesEnabled: true,
        homeworkUpdatesEnabled: true,
        attendanceAlertsEnabled: true,
        leaveUpdatesEnabled: true,
        calendarRemindersEnabled: true,
        gradebookUpdatesEnabled: true,
        feeUpdatesEnabled: true
      }
    }),
    ownerPairs.length === 0 ? [] : tx.schoolCastConsentRecord.findMany({
      where: {
        tenantId: input.tenantId,
        OR: ownerPairs,
        purpose: input.purpose,
        channel: { in: [...input.channels] },
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }]
      },
      select: { id: true, ownerType: true, ownerId: true, channel: true, status: true, capturedAt: true },
      orderBy: { capturedAt: "desc" }
    })
  ]);

  const preferenceByOwner = new Map(preferences.map((item) => [`${item.ownerType}:${item.ownerId}`, item]));
  const consentByOwnerChannel = new Map<string, (typeof consentRecords)[number]>();
  for (const item of consentRecords) {
    const key = `${item.ownerType}:${item.ownerId}:${item.channel}`;
    if (!consentByOwnerChannel.has(key)) consentByOwnerChannel.set(key, item);
  }

  return new Map(input.recipients.map((recipient) => {
    const decisions = input.channels.map((channel): SchoolCastEligibilityDecision => {
      if (!channelFeatureEnabled(input.featureState, channel)) {
        return { channel, eligible: false, reasonCode: "CHANNEL_DISABLED", consentRecordId: null, encryptedAddress: null };
      }
      const address = channelAddress(recipient, channel);
      if (!address) {
        return { channel, eligible: false, reasonCode: "CONTACT_UNAVAILABLE", consentRecordId: null, encryptedAddress: null };
      }
      if (channel === "IN_APP") {
        return { channel, eligible: true, reasonCode: null, consentRecordId: null, encryptedAddress: null };
      }
      if (!recipient.preferenceOwnerType || !recipient.preferenceOwnerId) {
        return { channel, eligible: false, reasonCode: "RECIPIENT_PREFERENCE_UNAVAILABLE", consentRecordId: null, encryptedAddress: null };
      }
      const ownerKey = `${recipient.preferenceOwnerType}:${recipient.preferenceOwnerId}`;
      const preference = preferenceByOwner.get(ownerKey);
      if (!preference || !preferenceAllows(preference, channel) || !purposeEnabled(preference, input.purpose)) {
        return { channel, eligible: false, reasonCode: "RECIPIENT_OPTED_OUT", consentRecordId: null, encryptedAddress: null };
      }
      const consent = consentByOwnerChannel.get(`${ownerKey}:${channel}`);
      if (!consent || !["GRANTED", "NOT_REQUIRED_BY_POLICY"].includes(consent.status)) {
        return { channel, eligible: false, reasonCode: consent?.status === "WITHDRAWN" ? "CONSENT_WITHDRAWN" : "CONSENT_REQUIRED", consentRecordId: consent?.id ?? null, encryptedAddress: null };
      }
      const encrypted = encryptionDecision(address, input.featureState.deliveryMode);
      return {
        channel,
        eligible: encrypted.eligible,
        reasonCode: encrypted.reasonCode,
        consentRecordId: consent.id,
        encryptedAddress: encrypted.encryptedAddress
      };
    });
    return [recipient.stableRecipientKey, decisions] as const;
  }));
}