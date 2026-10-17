import { describe, it, expect } from "vitest";
import {
  generateVerificationCode,
  generateResetToken,
  hashSecret,
  minutesFromNow,
} from "../otp";

describe("generateVerificationCode", () => {
  it("is always 6 digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("generateResetToken", () => {
  it("produces a URL-safe token with no padding characters", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });

  it("produces different tokens on each call", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
  });
});

describe("hashSecret", () => {
  it("is deterministic for the same input", () => {
    expect(hashSecret("hello")).toBe(hashSecret("hello"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashSecret("hello")).not.toBe(hashSecret("hello2"));
  });

  it("never returns the plaintext input", () => {
    const secret = "042817";
    expect(hashSecret(secret)).not.toBe(secret);
  });

  it("produces a 64-character hex string (SHA-256)", () => {
    expect(hashSecret("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("minutesFromNow", () => {
  it("returns a Date offset by the given number of minutes", () => {
    const before = Date.now();
    const result = minutesFromNow(10);
    const after = Date.now();
    const diff = result.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(10 * 60 * 1000 + (after - before));
  });
});
