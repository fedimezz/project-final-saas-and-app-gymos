import "./setup";
import test from "node:test";
import assert from "node:assert/strict";
import { buildPalette, contrast } from "../src/theme/palette";

test("uses the club's primary and secondary colors when they are readable", () => {
  const p = buildPalette({ primaryColor: "#4f46e5", secondaryColor: "#3b82f6" }, false);
  assert.equal(p.primary, "#4f46e5");
  assert.ok(contrast(p.secondary, p.surface) >= 3);
});

test("falls back to neutral defaults for missing or invalid colors", () => {
  for (const input of [null, undefined, {}, { primaryColor: "not-a-color" }, "zzz"] as const) {
    const p = buildPalette(input as never, false);
    assert.match(p.primary, /^#[0-9a-f]{6}$/);
    assert.equal(p.background, "#f7f7f9");
  }
});

test("a near-black primary stays visible in dark mode", () => {
  const p = buildPalette({ primaryColor: "#18181b" }, true);
  assert.ok(contrast(p.primary, p.background) >= 3, `contrast ${contrast(p.primary, p.background)}`);
});

test("a very light primary stays visible in light mode", () => {
  const p = buildPalette({ primaryColor: "#fde68a" }, false);
  assert.ok(contrast(p.primary, p.background) >= 3);
});

test("text on primary/secondary is always readable", () => {
  for (const color of ["#f97316", "#10b981", "#4338ca", "#18181b", "#ffffff", "#000000"]) {
    for (const dark of [true, false]) {
      const p = buildPalette({ primaryColor: color, secondaryColor: color }, dark);
      assert.ok(contrast(p.primaryText, p.primary) >= 4.5, `${color} dark=${dark} primary`);
      assert.ok(contrast(p.secondaryText, p.secondary) >= 4.5, `${color} dark=${dark} secondary`);
    }
  }
});

test("web-default backgrounds keep the app's neutral look; custom ones are applied", () => {
  assert.equal(buildPalette({ backgroundColor: "#ffffff" }, false).background, "#f7f7f9");
  assert.equal(buildPalette({ backgroundColorDark: "#0a0a0a" }, true).background, "#0b0b0f");
  assert.equal(buildPalette({ backgroundColor: "#fff7ed" }, false).background, "#fff7ed");
  assert.equal(buildPalette({ backgroundColorDark: "#0f0b24" }, true).background, "#0f0b24");
});

test("text follows actual background brightness, not the mode flag", () => {
  const p = buildPalette({ backgroundColorDark: "#fafafa" }, true); // light bg set for dark mode
  assert.ok(contrast(p.text, p.background) >= 7);
  assert.ok(contrast(p.textMuted, p.background) >= 4.5);
});

test("3-digit hex and uppercase are accepted", () => {
  assert.equal(buildPalette({ primaryColor: "#F00" }, false).primary.length, 7);
});
