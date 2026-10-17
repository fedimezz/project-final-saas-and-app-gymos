// lib/brand-colors.ts
//
// Single place that turns a club's chosen colors into the CSS variables the
// whole UI reads. Pure (no server/client-only imports) so it runs both in
// app/layout.tsx (server-rendered on <html>, so there is NO green flash before
// the first paint) and in ClubSettingsContext (live refresh after the owner
// changes the theme).
//
// globals.css remaps Tailwind's emerald / green palette to --brand and teal
// to --brand-2, so every existing `bg-emerald-500`, `text-emerald-400`,
// `from-emerald-500 to-teal-400` ... automatically follows the club theme.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb color. */
export function shade(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const num = parseInt(clean, 16);
  const mix = (channel: number) =>
    amount >= 0
      ? Math.round(channel + (255 - channel) * amount)
      : Math.round(channel * (1 + amount));
  const clamp = (n: number) => Math.min(255, Math.max(0, n));
  const r = clamp(mix((num >> 16) & 0xff));
  const g = clamp(mix((num >> 8) & 0xff));
  const b = clamp(mix(num & 0xff));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((num >> 16) & 0xff) + 0.7152 * lin((num >> 8) & 0xff) + 0.0722 * lin(num & 0xff);
}

/** Text color (dark or white) that stays readable on top of `hex`. */
export function readableOn(hex: string): string {
  if (!isHex(hex)) return "#020617";
  const L = luminance(hex);
  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithDark = (L + 0.05) / 0.052;
  return contrastWithDark >= contrastWithWhite ? "#020617" : "#ffffff";
}

/** WCAG contrast ratio between two #rrggbb colors, 1 … 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `hex` nudged lighter (on a dark `bg`) or darker (on a light `bg`) until it
 * reaches `min` contrast on `bg`; returned unchanged when it is already readable.
 * Brand colors are fine as button FILLS but often too weak as small TEXT (a deep
 * red on a near-black card), so text uses these instead.
 */
export function readableTextColor(hex: string, bg: string, min = 4.5): string {
  if (!isHex(hex) || !isHex(bg)) return hex;
  const direction = luminance(bg) < 0.5 ? 1 : -1;
  let out = hex;
  for (let step = 1; step <= 20 && contrastRatio(out, bg) < min; step++) {
    out = shade(hex, direction * step * 0.05);
  }
  return out;
}

// Typical card surfaces the brand color is read on (dark gym themes / light themes).
const SURFACE_DARK = "#1a1a1d";
const SURFACE_LIGHT = "#f5f0e8";

export const DEFAULT_BRAND = "#10b981";
export const DEFAULT_BRAND_2 = "#14b8a6";

/** All CSS custom properties for a club's colors. */
export function brandVars(primary?: string | null, secondary?: string | null): Record<string, string> {
  const vars: Record<string, string> = {};
  if (isHex(primary)) {
    const p = primary.trim();
    vars["--primary"] = p;
    vars["--primary-dark"] = shade(p, -0.2);
    vars["--primary-light"] = shade(p, 0.2);
    vars["--brand"] = p;
    vars["--brand-contrast"] = readableOn(p);
    // Brand-colored TEXT (eyebrows, ticks, accents): readable on dark / light surfaces.
    vars["--brand-on-dark"] = readableTextColor(p, SURFACE_DARK);
    vars["--brand-on-light"] = readableTextColor(p, SURFACE_LIGHT);
  }
  if (isHex(secondary)) {
    const s = secondary.trim();
    vars["--secondary"] = s;
    vars["--secondary-dark"] = shade(s, -0.2);
    vars["--brand-2"] = s;
  } else if (isHex(primary)) {
    vars["--brand-2"] = shade(primary.trim(), 0.15);
  }
  return vars;
}
