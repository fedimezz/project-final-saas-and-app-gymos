import { describe, it, expect } from "vitest";
import {
  THEME_IDS, THEME_PRESETS, HERO_MODELS, HERO_MODEL_IDS, resolveThemeId, resolveHeroModel, getTheme, matchingThemeId, isHeroModelId,
} from "../website-themes";

describe("website themes", () => {
  it("keeps the original theme ids first and appends the newer ones (eighteen total, last three premium)", () => {
    expect([...THEME_IDS].slice(0, 5)).toEqual(["musculation", "crossfit", "boxing", "yoga", "modern"]);
    expect([...THEME_IDS].slice(5, 10)).toEqual(["luxury", "neon", "powerlifting", "urban", "minimalist"]);
    expect([...THEME_IDS].slice(10)).toEqual(["monochrome", "sunset", "ocean", "royal", "forest", "gold", "cyber", "aurora"]);
    expect(THEME_PRESETS.filter((t) => t.premium).map((t) => t.id)).toEqual(["gold", "cyber", "aurora"]);
    expect(THEME_PRESETS).toHaveLength(18);
    expect(THEME_PRESETS.map((t) => t.id)).toEqual([...THEME_IDS]);
  });

  it("every theme has its own brand colors and a valid default 3D model (the first ten also keep their own layout and font)", () => {
    const original = THEME_PRESETS.slice(0, 10);
    expect(new Set(original.map((t) => t.layout)).size).toBe(10);
    expect(new Set(original.map((t) => t.headingFont)).size).toBe(10);
    expect(new Set(THEME_PRESETS.map((t) => `${t.primaryColor}|${t.secondaryColor}`)).size).toBe(18);
    for (const t of THEME_PRESETS) {
      expect(HERO_MODEL_IDS).toContain(t.defaultHeroModel);
      expect(t.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.secondaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("resolves every theme id (old and new) to itself and keeps legacy aliases", () => {
    for (const id of THEME_IDS) expect(resolveThemeId(id)).toBe(id);
    expect(getTheme("luxury").name).toBe("Luxury Fitness Club");
    expect(getTheme("neon").name).toBe("Neon Performance");
    expect(getTheme("powerlifting").name).toBe("Powerlifting");
    expect(getTheme("urban").name).toBe("Urban Street Gym");
    expect(getTheme("minimalist").name).toBe("Premium Minimalist");
    expect(getTheme("monochrome").name).toBe("Noir & Blanc");
  });

  it("offers the requested 3D objects", () => {
    const ids = HERO_MODELS.map((m) => m.id);
    for (const required of ["dumbbell", "dumbbell-classic", "kettlebell", "barbell", "boxing-glove"]) expect(ids).toContain(required);
    expect(HERO_MODELS.length).toBeGreaterThanOrEqual(6);
  });

  it("maps legacy theme ids and unknown values to a valid theme", () => {
    expect(resolveThemeId("classic")).toBe("modern");
    expect(resolveThemeId("energetic")).toBe("crossfit");
    expect(resolveThemeId("nature")).toBe("yoga");
    expect(resolveThemeId("midnight")).toBe("boxing");
    expect(resolveThemeId("minimal")).toBe("musculation");
    expect(resolveThemeId("custom")).toBe("modern");
    expect(resolveThemeId("boxing")).toBe("boxing");
    expect(resolveThemeId(null)).toBe("modern");
    expect(resolveThemeId("<script>")).toBe("modern");
  });

  it("uses the chosen hero model, else the theme default", () => {
    expect(resolveHeroModel("boxing", "kettlebell")).toBe("kettlebell");
    expect(resolveHeroModel("boxing", null)).toBe("boxing-glove");
    expect(resolveHeroModel("yoga", "not-a-model")).toBe("zen-stones");
    expect(isHeroModelId("barbell")).toBe(true);
    expect(isHeroModelId("rocket")).toBe(false);
    expect(getTheme("crossfit").name).toBe("CrossFit");
  });

  it("matchingThemeId still recognises preset colors", () => {
    const p = THEME_PRESETS[0];
    expect(matchingThemeId(p.primaryColor, p.secondaryColor)).toBe(p.id);
    expect(matchingThemeId("#000001", "#000002")).toBe("custom");
  });
});
