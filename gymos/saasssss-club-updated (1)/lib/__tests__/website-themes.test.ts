import { describe, it, expect } from "vitest";
import {
  THEME_IDS, THEME_PRESETS, HERO_MODELS, HERO_MODEL_IDS, resolveThemeId, resolveHeroModel, getTheme, matchingThemeId, isHeroModelId,
} from "../website-themes";

describe("website themes", () => {
  it("offers exactly the five required themes, each with its own layout, fonts and default 3D model", () => {
    expect([...THEME_IDS]).toEqual(["musculation", "crossfit", "boxing", "yoga", "modern"]);
    expect(THEME_PRESETS).toHaveLength(5);
    expect(new Set(THEME_PRESETS.map((t) => t.layout)).size).toBe(5);
    expect(new Set(THEME_PRESETS.map((t) => t.headingFont)).size).toBe(5);
    expect(new Set(THEME_PRESETS.map((t) => t.primaryColor)).size).toBe(5);
    for (const t of THEME_PRESETS) expect(HERO_MODEL_IDS).toContain(t.defaultHeroModel);
  });

  it("offers the requested 3D objects", () => {
    const ids = HERO_MODELS.map((m) => m.id);
    for (const required of ["dumbbell", "kettlebell", "barbell", "boxing-glove"]) expect(ids).toContain(required);
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
