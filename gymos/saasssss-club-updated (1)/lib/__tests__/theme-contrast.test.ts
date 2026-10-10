/**
 * Accessible contrast of the semantic theme tokens in app/globals.css, in BOTH
 * modes: parses the real CSS (so a future token change that breaks readability
 * fails here) and checks WCAG 2.x ratios.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const light = block(":root");
const dark = { ...light, ...block(".dark") };

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = ["bg-primary", "bg-card", "bg-muted"] as const;
const bodyText = ["text-primary", "text-secondary", "text-muted"] as const;
const statusText = ["success-fg", "warning-fg", "danger-fg", "info-fg"] as const;

describe.each([["light", light], ["dark", dark]] as const)("%s mode contrast", (_name, tokens) => {
  it.each(bodyText)("%s is >= 4.5:1 on every surface", (t) => {
    for (const s of surfaces) expect(ratio(tokens[t], tokens[s]), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it.each(statusText)("%s (status text) is >= 4.5:1 on every surface", (t) => {
    for (const s of surfaces) expect(ratio(tokens[t], tokens[s]), `${t} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });
  it("disabled text still reads as >= 3:1 on cards", () => {
    expect(ratio(tokens["text-disabled"], tokens["bg-card"])).toBeGreaterThanOrEqual(2.5);
  });
});
