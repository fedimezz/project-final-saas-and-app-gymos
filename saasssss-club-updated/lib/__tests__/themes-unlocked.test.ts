import { describe, it, expect } from "vitest";
import { THEME_PRESETS, HERO_MODELS, SELECTABLE_THEME_PRESETS, isSelectableThemeId } from "@/lib/website-themes";

describe("themes and standard 3D models are included in every plan", () => {
  it("has no paid flag on any theme or model", () => {
    expect(THEME_PRESETS.some((t) => "premium" in t)).toBe(false);
    expect(HERO_MODELS.some((m) => "premium" in m)).toBe(false);
  });

  it("every selectable theme (including Gold Elite, Cyber Pulse, Aurora Glass) can be chosen", () => {
    for (const id of ["gold", "cyber", "aurora"]) expect(isSelectableThemeId(id)).toBe(true);
    expect(SELECTABLE_THEME_PRESETS.map((t) => t.id)).toEqual(expect.arrayContaining(["gold", "cyber", "aurora"]));
  });

  it("still contains the formerly premium 3D models", () => {
    const ids = HERO_MODELS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["crown", "diamond", "gold-dumbbell"]));
  });
});
