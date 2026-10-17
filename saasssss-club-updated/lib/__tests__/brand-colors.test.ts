import { describe, expect, it } from "vitest";
import { brandVars, contrastRatio, readableTextColor } from "@/lib/brand-colors";
import { THEME_PRESETS } from "@/lib/website-themes";

const DARK = "#1a1a1d";
const LIGHT = "#f5f0e8";

describe("readableTextColor", () => {
  it("lightens a too-dark brand color until it reads on a dark surface", () => {
    const out = readableTextColor("#b91c1c", DARK); // powerlifting red
    expect(contrastRatio("#b91c1c", DARK)).toBeLessThan(4.5);
    expect(contrastRatio(out, DARK)).toBeGreaterThanOrEqual(4.5);
  });

  it("darkens a too-light brand color until it reads on a light surface", () => {
    const out = readableTextColor("#39ff14", LIGHT); // neon green
    expect(contrastRatio(out, LIGHT)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves an already readable color untouched", () => {
    expect(readableTextColor("#f59e0b", DARK)).toBe("#f59e0b");
  });

  it("ignores values that are not #rrggbb", () => {
    expect(readableTextColor("red", DARK)).toBe("red");
    expect(readableTextColor("#abc", DARK)).toBe("#abc");
  });
});

describe("brandVars text tokens", () => {
  it.each(THEME_PRESETS.map((t) => [t.id, t.primaryColor, t.secondaryColor]))(
    "%s: brand text is readable on both dark and light surfaces",
    (_id, primary, secondary) => {
      const v = brandVars(primary, secondary);
      expect(contrastRatio(v["--brand-on-dark"], DARK)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--brand-on-light"], LIGHT)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("keeps the existing variables unchanged", () => {
    const v = brandVars("#f59e0b", "#78716c");
    expect(v["--brand"]).toBe("#f59e0b");
    expect(v["--primary"]).toBe("#f59e0b");
    expect(v["--brand-2"]).toBe("#78716c");
    expect(v["--brand-contrast"]).toBe("#020617");
  });
});
