// Static guard: every one of the ten themes must define its design tokens, and
// the added themes must ship their fonts, hero backdrops and motion fallbacks.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { THEME_IDS, THEME_PRESETS } from "../website-themes";

const css = readFileSync(path.resolve(import.meta.dirname, "../../app/themes.css"), "utf8");

describe("themes.css", () => {
  it.each(THEME_IDS)("defines tokens for theme %s", (id) => {
    expect(css).toMatch(new RegExp(`\\[data-site-theme="${id}"\\]\\s*\\{[^}]*--t-heading-font`));
  });

  it("has a hero backdrop class for every layout", () => {
    for (const layout of new Set(THEME_PRESETS.map((t) => t.layout))) {
      expect(css, layout).toContain(`.hero-${layout}`);
    }
  });

  it("imports a font file for every added heading font", () => {
    for (const pkg of ["playfair-display", "orbitron", "oswald", "archivo-black"]) expect(css).toContain(`@fontsource/${pkg}/`);
  });

  it("switches off the new looping animations for prefers-reduced-motion", () => {
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    for (const cls of [".neon-floor", ".neon-glow", ".salon-gold"]) expect(reduced).toContain(cls);
  });
});
