import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

function key() {
  if (!env.SCHOOLCAST_DATA_ENCRYPTION_KEY || env.SCHOOLCAST_DATA_ENCRYPTION_KEY.length < 32) {
    throw new AppError("SCHOOLCAST_CONTACT_ENCRYPTION_UNAVAILABLE", "SCHOOLCAST_CONTACT_ENCRYPTION_UNAVAILABLE", 503);
  }
  return createHash("sha256").update(env.SCHOOLCAST_DATA_ENCRYPTION_KEY, "utf8").digest();
}

export function encryptSchoolCastContact(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSchoolCastContact(value: string) {
  const [version, ivText, tagText, encryptedText] = value.split(".");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new AppError("SCHOOLCAST_CONTACT_CIPHERTEXT_INVALID", "SCHOOLCAST_CONTACT_CIPHERTEXT_INVALID", 500);
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function isSchoolCastContactEncryptionConfigured() {
  return Boolean(env.SCHOOLCAST_DATA_ENCRYPTION_KEY && env.SCHOOLCAST_DATA_ENCRYPTION_KEY.length >= 32);
}