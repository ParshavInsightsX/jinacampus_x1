import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "@/lib/env";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const DUMMY_PASSWORD_SALT = "jinacampus-password-login-dummy-v1";
const DUMMY_PASSWORD_KEY = Buffer.alloc(KEY_LENGTH, 0);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password + env.PASSWORD_PEPPER, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, key] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const derivedKey = (await scrypt(password + env.PASSWORD_PEPPER, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

export async function verifyPasswordOrDummy(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (storedHash) return verifyPassword(password, storedHash);

  const derivedKey = (await scrypt(
    password + env.PASSWORD_PEPPER,
    DUMMY_PASSWORD_SALT,
    KEY_LENGTH
  )) as Buffer;
  timingSafeEqual(derivedKey, DUMMY_PASSWORD_KEY);
  return false;
}
