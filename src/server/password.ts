import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const MIN_PASSWORD_LENGTH = 8;

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

// tokens we hand out are stored only as this digest, so a DB leak can't replay them
export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
