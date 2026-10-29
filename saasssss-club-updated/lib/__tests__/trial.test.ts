import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ default: {} }));
import { defaultTrialDays, emailMailbox, isTrialExpired, trialDaysLeft, trialState } from "@/lib/trial";
import { isClubUsable } from "@/lib/tenant";

const now = new Date("2026-10-17T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);

describe("trial state", () => {
  it("is ACTIVE before trialEndsAt and EXPIRED at/after it, only for TRIAL clubs", () => {
    expect(trialState({ status: "TRIAL", trialEndsAt: inDays(1) }, now)).toBe("ACTIVE");
    expect(trialState({ status: "TRIAL", trialEndsAt: now }, now)).toBe("EXPIRED");
    expect(trialState({ status: "TRIAL", trialEndsAt: inDays(-3) }, now)).toBe("EXPIRED");
    expect(trialState({ status: "ACTIVE", trialEndsAt: inDays(-3) }, now)).toBe("NONE");
    expect(trialState({ status: "SUSPENDED", trialEndsAt: inDays(-3) }, now)).toBe("NONE");
  });
  it("never expires a trial that has no recorded end date (no guessing)", () => {
    expect(isTrialExpired({ status: "TRIAL", trialEndsAt: null }, now)).toBe(false);
  });
  it("counts remaining days rounded up, and 0 once over", () => {
    expect(trialDaysLeft(inDays(14), now)).toBe(14);
    expect(trialDaysLeft(new Date(now.getTime() + 3_600_000), now)).toBe(1);
    expect(trialDaysLeft(inDays(-1), now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBe(0);
  });
  it("default length is 14 days unless a valid DEFAULT_TRIAL_DAYS (1-90) is set", () => {
    expect(defaultTrialDays({})).toBe(14);
    expect(defaultTrialDays({ DEFAULT_TRIAL_DAYS: "30" })).toBe(30);
    for (const bad of ["0", "91", "abc", "-5", "2.5"]) expect(defaultTrialDays({ DEFAULT_TRIAL_DAYS: bad })).toBe(14);
  });
});

describe("trial expiry is enforced on the request itself (not only by the daily cron)", () => {
  const club = (status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED", trialEndsAt: Date | null) =>
    ({ id: "c", slug: "c", name: "C", status, trialEndsAt });
  it("a TRIAL club whose end date has passed is not usable even though the cron has not run", () => {
    expect(isClubUsable(club("TRIAL", new Date(Date.now() + 86_400_000)))).toBe(true);
    expect(isClubUsable(club("TRIAL", new Date(Date.now() - 1000)))).toBe(false);
  });
  it("ACTIVE clubs stay usable; suspended and cancelled never are", () => {
    expect(isClubUsable(club("ACTIVE", null))).toBe(true);
    expect(isClubUsable(club("SUSPENDED", null))).toBe(false);
    expect(isClubUsable(club("CANCELLED", null))).toBe(false);
    expect(isClubUsable(null)).toBe(false);
  });
});

describe("anti-abuse mailbox normalisation", () => {
  it("strips +tags and lowercases so aliases of one mailbox collide", () => {
    expect(emailMailbox("Owner+promo1@Gmail.com")).toEqual({ local: "owner", domain: "gmail.com" });
    expect(emailMailbox("owner@gmail.com")).toEqual({ local: "owner", domain: "gmail.com" });
  });
});
