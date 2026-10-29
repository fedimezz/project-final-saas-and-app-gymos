import crypto from "crypto";

/** 6-digit numeric code for email verification, e.g. "042817". */
export function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Opaque URL-safe token for one-time invitation acceptance. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** SHA-256 hash — codes/tokens are only ever stored hashed, never plaintext. */
export function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
