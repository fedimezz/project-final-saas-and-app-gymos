import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
import { isPaidPeriodExpired, paidAccessEndsAt, paidGraceDays } from "@/lib/subscription-expiry";
import { isClubUsable } from "@/lib/tenant";

const now = new Date("2026-10-21T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

describe("paid period expiry (monthly / yearly)", () => {
  it("is not expired before the period end, nor inside the grace window", () => {
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: inDays(5) }, now, 3)).toBe(false);
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: daysAgo(2) }, now, 3)).toBe(false);
  });
  it("is expired once the grace window is over", () => {
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: daysAgo(3) }, now, 3)).toBe(true);
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: daysAgo(40) }, now, 3)).toBe(true);
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: daysAgo(1) }, now, 0)).toBe(true);
  });
  it("never expires a platform-managed club (no period end recorded) — no guessing", () => {
    expect(isPaidPeriodExpired({ status: "ACTIVE", paidUntil: null }, now, 0)).toBe(false);
    expect(isPaidPeriodExpired({ status: "ACTIVE" }, now, 0)).toBe(false);
    expect(paidAccessEndsAt(null)).toBeNull();
  });
  it("only concerns ACTIVE clubs (trials have their own rule in lib/trial.ts)", () => {
    expect(isPaidPeriodExpired({ status: "TRIAL", paidUntil: daysAgo(100) }, now, 0)).toBe(false);
    expect(isPaidPeriodExpired({ status: "SUSPENDED", paidUntil: daysAgo(100) }, now, 0)).toBe(false);
  });
  it("grace is 3 days unless a valid PAID_PERIOD_GRACE_DAYS (0-30) is set", () => {
    expect(paidGraceDays({})).toBe(3);
    expect(paidGraceDays({ PAID_PERIOD_GRACE_DAYS: "7" })).toBe(7);
    expect(paidGraceDays({ PAID_PERIOD_GRACE_DAYS: "0" })).toBe(0);
    for (const bad of ["-1", "31", "abc", "1.5", ""]) expect(paidGraceDays({ PAID_PERIOD_GRACE_DAYS: bad })).toBe(3);
  });
});

describe("isClubUsable enforces paid-period expiry on every request", () => {
  const base = { id: "c1", slug: "gym", name: "Gym" };
  it("lets an ACTIVE club with a future (or no) period end in", () => {
    expect(isClubUsable({ ...base, status: "ACTIVE", paidUntil: inDays(10) })).toBe(true);
    expect(isClubUsable({ ...base, status: "ACTIVE", paidUntil: null })).toBe(true);
    expect(isClubUsable({ ...base, status: "ACTIVE" })).toBe(true);
  });
  it("refuses an ACTIVE club whose paid period (+ grace) is over, without waiting for the cron", () => {
    expect(isClubUsable({ ...base, status: "ACTIVE", paidUntil: new Date(Date.now() - 60 * 86_400_000) })).toBe(false);
  });
  it("still refuses suspended / cancelled clubs", () => {
    expect(isClubUsable({ ...base, status: "SUSPENDED", paidUntil: inDays(10) })).toBe(false);
    expect(isClubUsable({ ...base, status: "CANCELLED", paidUntil: null })).toBe(false);
  });
});
