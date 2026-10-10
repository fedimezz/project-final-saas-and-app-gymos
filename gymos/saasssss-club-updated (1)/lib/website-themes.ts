// lib/website-themes.ts
//
// The 5 website themes a club owner can pick (website wizard + /admin/theme),
// and the 3D hero objects they can choose from. A theme is NOT just a color
// pair: it selects a complete visual identity — layout, typography, section
// styling, motion and a default 3D hero object — implemented by
// components/themes/* and app/themes.css (keyed by `data-site-theme`).
// Picking one also stages its default primary/secondary colors, which the owner
// can then override (branding) — the chosen colors always win over the preset.
//
// Pure data, no server-only imports — safe to import from client components,
// API routes and the validation layer.

export const THEME_IDS = ["musculation", "crossfit", "boxing", "yoga", "modern"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const HERO_MODEL_IDS = [
  "dumbbell",
  "kettlebell",
  "barbell",
  "boxing-glove",
  "weight-plate",
  "medicine-ball",
  "punching-bag",
  "zen-stones",
] as const;
export type HeroModelId = (typeof HERO_MODEL_IDS)[number];

export interface HeroModelInfo {
  id: HeroModelId;
  name: string;
  description: string;
}

export const HERO_MODELS: HeroModelInfo[] = [
  { id: "dumbbell", name: "Haltère", description: "Le classique du fitness." },
  { id: "kettlebell", name: "Kettlebell", description: "Force et explosivité." },
  { id: "barbell", name: "Barre olympique", description: "Barre chargée de disques." },
  { id: "boxing-glove", name: "Gant de boxe", description: "Pour les clubs de combat." },
  { id: "weight-plate", name: "Disque de musculation", description: "Fonte brute, look atelier." },
  { id: "medicine-ball", name: "Médecine-ball", description: "Cross-training et cardio." },
  { id: "punching-bag", name: "Sac de frappe", description: "Boxe, MMA, cardio-boxe." },
  { id: "zen-stones", name: "Pierres zen", description: "Yoga, pilates, bien-être." },
];

export type ThemeLayout = "forge" | "arena" | "ring" | "studio" | "bento";

export interface ThemePreset {
  id: ThemeId;
  name: string;
  description: string;
  /** Which page layout (components/themes) renders the club's home. */
  layout: ThemeLayout;
  primaryColor: string;
  secondaryColor: string;
  // Used for the picker's mini "browser" preview background, so a light
  // theme doesn't render dark text on a dark card and vice versa.
  previewBg: string;
  previewText: string;
  defaultHeroModel: HeroModelId;
  /** Display typography (loaded from self-hosted @fontsource files in app/themes.css). */
  headingFont: string;
  bodyFont: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "musculation",
    name: "Musculation",
    description: "Acier, fonte et typographie massive — salle de force et de bodybuilding.",
    layout: "forge",
    primaryColor: "#f59e0b",
    secondaryColor: "#78716c",
    previewBg: "#111111",
    previewText: "#fafaf9",
    defaultHeroModel: "barbell",
    headingFont: "Anton",
    bodyFont: "Inter",
  },
  {
    id: "crossfit",
    name: "CrossFit",
    description: "Tableau de WOD, bandes diagonales et énergie brute — box de cross-training.",
    layout: "arena",
    primaryColor: "#ef4444",
    secondaryColor: "#f97316",
    previewBg: "#18181b",
    previewText: "#fafafa",
    defaultHeroModel: "kettlebell",
    headingFont: "Barlow Condensed",
    bodyFont: "Barlow",
  },
  {
    id: "boxing",
    name: "Boxing",
    description: "Ring, projecteurs et cordes — clubs de boxe, MMA et sports de combat.",
    layout: "ring",
    primaryColor: "#dc2626",
    secondaryColor: "#facc15",
    previewBg: "#0c0a09",
    previewText: "#fafaf9",
    defaultHeroModel: "boxing-glove",
    headingFont: "Bebas Neue",
    bodyFont: "Inter",
  },
  {
    id: "yoga",
    name: "Yoga & Bien-être",
    description: "Courbes douces, serif élégant et lumière calme — yoga, pilates, spa.",
    layout: "studio",
    primaryColor: "#0d9488",
    secondaryColor: "#c08457",
    previewBg: "#f6f1ea",
    previewText: "#2b2a28",
    defaultHeroModel: "zen-stones",
    headingFont: "Cormorant Garamond",
    bodyFont: "Nunito Sans",
  },
  {
    id: "modern",
    name: "Fitness Moderne",
    description: "Grille bento, verre dépoli et dégradés — clubs fitness contemporains.",
    layout: "bento",
    primaryColor: "#6366f1",
    secondaryColor: "#06b6d4",
    previewBg: "#f8fafc",
    previewText: "#0f172a",
    defaultHeroModel: "dumbbell",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
  },
];

// Clubs that picked one of the original color presets keep working: the old
// ids resolve to the closest new theme (their saved colors are untouched).
const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  classic: "modern",
  energetic: "crossfit",
  nature: "yoga",
  midnight: "boxing",
  minimal: "musculation",
  custom: "modern",
};

export const DEFAULT_THEME_ID: ThemeId = "modern";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function isHeroModelId(value: unknown): value is HeroModelId {
  return typeof value === "string" && (HERO_MODEL_IDS as readonly string[]).includes(value);
}

/** Any stored/unknown theme id → a valid ThemeId (legacy ids are mapped, unknown → default). */
export function resolveThemeId(themeId: string | null | undefined): ThemeId {
  if (isThemeId(themeId)) return themeId;
  if (themeId && LEGACY_THEME_ALIASES[themeId]) return LEGACY_THEME_ALIASES[themeId];
  return DEFAULT_THEME_ID;
}

export function getTheme(themeId: string | null | undefined): ThemePreset {
  const id = resolveThemeId(themeId);
  return THEME_PRESETS.find((t) => t.id === id) as ThemePreset;
}

export function findTheme(themeId: string | null | undefined): ThemePreset | null {
  if (!themeId) return null;
  return getTheme(themeId);
}

/** The owner's chosen model, or the theme's default when none (or an unknown one) is stored. */
export function resolveHeroModel(themeId: string | null | undefined, heroModel: string | null | undefined): HeroModelId {
  return isHeroModelId(heroModel) ? heroModel : getTheme(themeId).defaultHeroModel;
}

/** True when the given colors still match one of the presets exactly. */
export function matchingThemeId(primaryColor: string | null, secondaryColor: string | null): string {
  const match = THEME_PRESETS.find(
    (t) =>
      t.primaryColor.toLowerCase() === (primaryColor ?? "").toLowerCase() &&
      t.secondaryColor.toLowerCase() === (secondaryColor ?? "").toLowerCase()
  );
  return match?.id ?? "custom";
}
