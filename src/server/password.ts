import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const test = scryptSync(pw, salt, 32);
    return timingSafeEqual(Buffer.from(hash, "hex"), test);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}
