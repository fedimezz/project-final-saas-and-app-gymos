import { describe, it, expect } from "vitest";
import { PREMIUM_THEME_IDS, PREMIUM_HERO_IDS, isPremiumTheme, isPremiumHero, isUnlocked } from "@/lib/website-themes";

describe("premium themes and 3D models", () => {
  it("flags exactly the premium ones", () => {
    expect([...PREMIUM_THEME_IDS]).toEqual(["gold", "cyber", "aurora"]);
    expect([...PREMIUM_HERO_IDS]).toEqual(["crown", "diamond", "gold-dumbbell"]);
    expect(isPremiumTheme("gold")).toBe(true);
    expect(isPremiumTheme("musculation")).toBe(false);
    expect(isPremiumHero("crown")).toBe(true);
    expect(isPremiumHero("dumbbell-classic")).toBe(false);
    expect(isPremiumHero(null)).toBe(false);
  });

  it("unlocks via the pack or the specific id, never by default", () => {
    expect(isUnlocked([], "gold")).toBe(false);
    expect(isUnlocked(undefined, "gold")).toBe(false);
    expect(isUnlocked(["pack"], "cyber")).toBe(true);
    expect(isUnlocked(["gold"], "gold")).toBe(true);
    expect(isUnlocked(["gold"], "cyber")).toBe(false);
  });
});
