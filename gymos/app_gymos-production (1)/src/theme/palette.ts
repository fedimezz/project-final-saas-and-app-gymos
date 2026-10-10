// Builds the app palette from the club's OWN branding — the same values the
// owner sets on the website (theme preset or custom colors): GymSettings
// primaryColor, secondaryColor, backgroundColor, backgroundColorDark, served by
// /api/settings/public. Pure functions (no React Native imports) so they are
// unit-tested in tests/palette.test.ts.
//
// Safety rule: the owner can pick ANY color, so every color the UI draws text or
// buttons with is checked for readable contrast against what it sits on, and
// nudged lighter/darker when it would be unreadable (e.g. a near-black primary
// in dark mode). Missing/invalid values fall back to the neutral defaults.

const FALLBACK_PRIMARY = "#0f172a";
// The web's own defaults (see GymSettings in the Prisma schema). A club that
// never customised its background keeps the app's softer neutral background.
const WEB_DEFAULT_BG_LIGHT = "#ffffff";
const WEB_DEFAULT_BG_DARK = "#0a0a0a";

export interface ClubBranding {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
}

function normalizeHex(hex: string | null | undefined): string | null {
  if (typeof hex !== "string") return null;
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${v.toLowerCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

export function mix(hex: string, withHex: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  return rgbToHex(a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount);
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
function luminance(hex: string): number {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colors, 1 … 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function isDarkColor(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/** Black or white — whichever reads better ON `bg`. */
function readableOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#0a0a0a") ? "#ffffff" : "#0a0a0a";
}

/** Moves `color` toward white (on dark bg) or black (on light bg) until it reaches `min` contrast. */
export function ensureContrast(color: string, bg: string, min: number): string {
  if (contrast(color, bg) >= min) return color;
  const target = isDarkColor(bg) ? "#ffffff" : "#000000";
  for (let step = 1; step <= 20; step++) {
    const candidate = mix(color, target, step * 0.05);
    if (contrast(candidate, bg) >= min) return candidate;
  }
  return target;
}

export interface Palette {
  primary: string; // buttons, active tab, links — guaranteed visible on `background`
  primaryText: string; // readable text/icon color ON TOP of `primary`
  secondary: string; // the club's secondary brand color — guaranteed visible on `surface`
  secondaryText: string; // readable text/icon color ON TOP of `secondary`
  accent: string; // alias of `secondary` (kept for existing callers)
  background: string;
  surface: string; // card backgrounds
  border: string;
  text: string;
  textMuted: string;
  success: string;
  danger: string;
  warning: string;
}

export function buildPalette(branding: ClubBranding | string | null | undefined, dark: boolean): Palette {
  // Back-compat: a bare string is treated as the primary color only.
  const b: ClubBranding = typeof branding === "string" ? { primaryColor: branding } : branding ?? {};

  const rawBg = normalizeHex(dark ? b.backgroundColorDark : b.backgroundColor);
  const customBg = rawBg && rawBg !== (dark ? WEB_DEFAULT_BG_DARK : WEB_DEFAULT_BG_LIGHT) ? rawBg : null;

  const background = customBg ?? (dark ? "#0b0b0f" : "#f7f7f9");
  // Text color follows the ACTUAL background brightness, not the mode flag, so a
  // club that set a light "dark-mode" background still gets readable text.
  const onDark = isDarkColor(background);

  const surface = onDark ? mix(background, "#ffffff", 0.07) : customBg && luminance(background) < 0.9 ? mix(background, "#ffffff", 0.6) : "#ffffff";
  const border = onDark ? mix(background, "#ffffff", 0.14) : mix(background, "#000000", 0.1);
  const text = onDark ? "#f5f5f7" : "#111114";
  const textMuted = onDark ? "#a3a3ad" : "#5f5f6b";

  const primary = ensureContrast(normalizeHex(b.primaryColor) ?? FALLBACK_PRIMARY, background, 3);
  const secondarySource = normalizeHex(b.secondaryColor) ?? mix(primary, onDark ? "#ffffff" : "#000000", onDark ? 0.35 : 0.12);
  const secondary = ensureContrast(secondarySource, surface, 3);

  return {
    primary,
    primaryText: readableOn(primary),
    secondary,
    secondaryText: readableOn(secondary),
    accent: secondary,
    background,
    surface,
    border,
    text,
    textMuted,
    success: onDark ? "#22c55e" : "#16a34a",
    danger: onDark ? "#ef4444" : "#dc2626",
    warning: onDark ? "#f59e0b" : "#d97706",
  };
}
