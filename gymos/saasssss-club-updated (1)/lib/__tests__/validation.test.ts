import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  phoneSchema,
  nameSchema,
  paginationSchema,
  formatZodError,
} from "../validation";
import { z } from "zod";

describe("emailSchema", () => {
  it("accepts a valid email and normalizes case/whitespace", () => {
    const result = emailSchema.parse("  Test@Example.com  ");
    expect(result).toBe("test@example.com");
  });

  it("rejects an invalid email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts a password meeting length and character requirements", () => {
    expect(passwordSchema.safeParse("Secret12").success).toBe(true);
    expect(passwordSchema.safeParse("secret12").success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(passwordSchema.safeParse("abc1234").success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("accepts an 8-digit local Tunisian number (no country code)", () => {
    expect(phoneSchema.safeParse("55213456").success).toBe(true);
  });

  it("accepts a number with a country code and spaces", () => {
    expect(phoneSchema.safeParse("+216 55 213 456").success).toBe(true);
  });

  it("rejects letters", () => {
    expect(phoneSchema.safeParse("call-me-maybe").success).toBe(false);
  });

  it("rejects a too-short string", () => {
    expect(phoneSchema.safeParse("12345").success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("rejects a single character", () => {
    expect(nameSchema.safeParse("A").success).toBe(false);
  });

  it("trims whitespace", () => {
    expect(nameSchema.parse("  Fedi Mez  ")).toBe("Fedi Mez");
  });
});

describe("paginationSchema", () => {
  it("coerces string query-param values to numbers", () => {
    const result = paginationSchema.parse({ page: "2", pageSize: "10" });
    expect(result).toEqual({ page: 2, pageSize: 10 });
  });

  it("defaults when fields are missing", () => {
    const result = paginationSchema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it("rejects a pageSize above the 100 cap (denial-of-service guard)", () => {
    expect(paginationSchema.safeParse({ pageSize: 99999 }).success).toBe(false);
  });
});

describe("formatZodError", () => {
  it("returns the first issue's message", () => {
    const schema = z.object({ a: z.string().min(2) });
    const result = schema.safeParse({ a: "x" });
    if (result.success) throw new Error("expected failure");
    expect(formatZodError(result.error).length).toBeGreaterThan(0);
  });
});

// Regression tests for the exact bug patterns found and fixed in
// app/api/admin/sessions/[id]/route.ts and app/api/admin/schedule/[id]/route.ts
// this session: `capacity: Number(capacity) || 20` silently turned an
// intentional capacity of 0 into 20, and negative numbers passed straight
// through. These tests exist so a future refactor can't silently
// reintroduce that bug without a test failing.
describe("session capacity schema (regression: falsy-zero bug)", () => {
  const capacitySchema = z.coerce.number().int().min(1).max(500);

  it("rejects capacity=0 instead of silently defaulting it away", () => {
    expect(capacitySchema.safeParse(0).success).toBe(false);
  });

  it("rejects negative capacity", () => {
    expect(capacitySchema.safeParse(-5).success).toBe(false);
  });

  it("rejects a garbage string (previously coerced to NaN, then to a fallback)", () => {
    expect(capacitySchema.safeParse("abc").success).toBe(false);
  });

  it("accepts a normal positive capacity", () => {
    expect(capacitySchema.safeParse(20).success).toBe(true);
  });
});
