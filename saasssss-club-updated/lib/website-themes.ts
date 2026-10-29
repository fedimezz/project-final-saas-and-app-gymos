// lib/website-themes.ts
//
// The 15 website themes a club owner can pick (website wizard + /admin/appearance),
// and the 3D hero objects they can choose from. The first five are the original
// themes (ids and saved preferences unchanged); the last five were added later. A theme is NOT just a color
// pair: it selects a complete visual identity — layout, typography, section
// styling, motion and a default 3D hero object — implemented by
// components/themes/* and app/themes.css (keyed by `data-site-theme`).
// Picking one also stages its default primary/secondary colors, which the owner
// can then override (branding) — the chosen colors always win over the preset.
//
// Pure data, no server-only imports — safe to import from client components,
// API routes and the validation layer.

export const THEME_IDS = [
  "musculation",
  "crossfit",
  "boxing",
  "yoga",
  "modern",
  // added themes
  "luxury",
  "neon",
  "powerlifting",
  "urban",
  "minimalist",
  // ClubX additions
  "monochrome",
  "sunset",
  "ocean",
  "royal",
  "forest",
  // formerly "premium": now included in every plan
  "gold",
  "cyber",
  "aurora",
] as const;
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
  // second batch
  "trophy",
  "stopwatch",
  "protein-shaker",
  "yoga-mat",
  "plyo-box",
  "jump-rope",
  "lotus",
  "gym-rings",
  // third batch: the club's original 3D dumbbell (public/models/dumbbell.glb)
  "dumbbell-classic",
  // formerly "premium": now included in every plan
  "crown",
  "diamond",
  "gold-dumbbell",
] as const;
export type HeroModelId = (typeof HERO_MODEL_IDS)[number];

export interface HeroModelInfo {
  id: HeroModelId;
  name: string;
  description: string;
}

export const HERO_MODELS: HeroModelInfo[] = [
  { id: "dumbbell", name: "Haltère", description: "Le classique du fitness." },
  { id: "dumbbell-classic", name: "Haltère d'origine", description: "Le modèle 3D historique de ClubX, tel qu'il était." },
  { id: "kettlebell", name: "Kettlebell", description: "Force et explosivité." },
  { id: "barbell", name: "Barre olympique", description: "Barre chargée de disques." },
  { id: "boxing-glove", name: "Gant de boxe", description: "Pour les clubs de combat." },
  { id: "weight-plate", name: "Disque de musculation", description: "Fonte brute, look atelier." },
  { id: "medicine-ball", name: "Médecine-ball", description: "Cross-training et cardio." },
  { id: "punching-bag", name: "Sac de frappe", description: "Boxe, MMA, cardio-boxe." },
  { id: "zen-stones", name: "Pierres zen", description: "Yoga, pilates, bien-être." },
  { id: "trophy", name: "Trophée", description: "Compétition, club premium." },
  { id: "stopwatch", name: "Chronomètre", description: "Performance et haute intensité." },
  { id: "protein-shaker", name: "Shaker protéiné", description: "Nutrition et musculation." },
  { id: "yoga-mat", name: "Tapis de yoga", description: "Yoga, pilates, stretching." },
  { id: "plyo-box", name: "Box de pliométrie", description: "Cross-training et jumps." },
  { id: "jump-rope", name: "Corde à sauter", description: "Cardio et boxe." },
  { id: "lotus", name: "Fleur de lotus", description: "Bien-être et sérénité." },
  { id: "gym-rings", name: "Anneaux de gym", description: "Street workout, calisthénie." },
  { id: "crown", name: "Couronne dorée", description: "club d'élite, champions." },
  { id: "diamond", name: "Diamant", description: "facettes brillantes, club haut de gamme." },
  { id: "gold-dumbbell", name: "Haltère en or", description: "l'haltère signature, finition or." },
];

export type ThemeLayout =
  | "forge"
  | "arena"
  | "ring"
  | "studio"
  | "bento"
  | "salon"
  | "grid"
  | "platform"
  | "street"
  | "editorial";

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
  /**
   * Retired from NEW choices (near-duplicate of another theme). Clubs already using it keep it —
   * it still renders, resolves and passes validation when unchanged — but pickers hide it and
   * onboarding / design-change requests refuse it.
   */
  retired?: boolean;
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
  {
    id: "luxury",
    name: "Luxury Fitness Club",
    description: "Noir profond, or brossé et serif élégant — club premium et exclusif.",
    layout: "salon",
    primaryColor: "#d4af37",
    secondaryColor: "#8c6d1f",
    previewBg: "#0b0a09",
    previewText: "#f6ecd2",
    defaultHeroModel: "trophy",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    // Same salon layout, black + gold and serif type as the premium "Gold Elite" — and free, which
    // undercut the paid unlock. Kept (not deleted) so existing clubs don't change look.
    retired: true,
  },
  {
    id: "neon",
    name: "Neon Performance",
    description: "Fonds sombres, vert néon et grille futuriste — performance et haute intensité.",
    layout: "grid",
    primaryColor: "#39ff14",
    secondaryColor: "#00e5ff",
    previewBg: "#05080a",
    previewText: "#e8fff0",
    defaultHeroModel: "stopwatch",
    headingFont: "Orbitron",
    bodyFont: "Inter",
  },
  {
    id: "powerlifting",
    name: "Powerlifting",
    description: "Rouge profond, noir et acier — identité industrielle, force pure.",
    layout: "platform",
    primaryColor: "#b91c1c",
    secondaryColor: "#71717a",
    previewBg: "#0d0d0f",
    previewText: "#f4f4f5",
    defaultHeroModel: "weight-plate",
    headingFont: "Oswald",
    bodyFont: "Inter",
  },
  {
    id: "urban",
    name: "Urban Street Gym",
    description: "Béton brut, gris sombre et orange — salle de quartier, esprit street.",
    layout: "street",
    primaryColor: "#f97316",
    secondaryColor: "#52525b",
    previewBg: "#27272a",
    previewText: "#fafafa",
    defaultHeroModel: "punching-bag",
    headingFont: "Archivo Black",
    bodyFont: "Barlow",
  },
  {
    id: "minimalist",
    name: "Premium Minimalist",
    description: "Ivoire, beige et charbon — mise en page éditoriale, sobre et raffinée.",
    layout: "editorial",
    primaryColor: "#9a8466",
    secondaryColor: "#2f2b28",
    previewBg: "#f7f2e8",
    previewText: "#2b2825",
    defaultHeroModel: "kettlebell",
    headingFont: "Inter",
    bodyFont: "Inter",
  },
  {
    id: "monochrome",
    name: "Noir & Blanc",
    description: "Contraste pur noir et blanc, typographie nette — l'identité ClubX.",
    layout: "editorial",
    primaryColor: "#18181b",
    secondaryColor: "#a1a1aa",
    previewBg: "#ffffff",
    previewText: "#09090b",
    defaultHeroModel: "dumbbell-classic",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
  },
  {
    id: "sunset",
    name: "Sunset Energy",
    description: "Dégradé corail et orange, énergie chaude — cardio, zumba, cours collectifs.",
    layout: "bento",
    primaryColor: "#f43f5e",
    secondaryColor: "#fb923c",
    previewBg: "#fff7ed",
    previewText: "#2a1210",
    defaultHeroModel: "jump-rope",
    headingFont: "Barlow Condensed",
    bodyFont: "Barlow",
  },
  {
    id: "ocean",
    name: "Ocean Aqua",
    description: "Bleus profonds et turquoise, formes fluides — natation, aqua-fitness, bien-être.",
    layout: "studio",
    primaryColor: "#0284c7",
    secondaryColor: "#14b8a6",
    previewBg: "#f0f9ff",
    previewText: "#0c1a2b",
    defaultHeroModel: "stopwatch",
    headingFont: "Nunito Sans",
    bodyFont: "Nunito Sans",
  },
  {
    id: "royal",
    name: "Royal Violet",
    description: "Violet profond, lilas et serif — club haut de gamme, coaching privé.",
    layout: "salon",
    primaryColor: "#8b5cf6",
    secondaryColor: "#f0abfc",
    previewBg: "#0f0a1f",
    previewText: "#f3ecff",
    defaultHeroModel: "trophy",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
  },
  {
    id: "forest",
    name: "Forest Outdoor",
    description: "Vert forêt et terre, style brut — training en plein air, trail, calisthénie.",
    layout: "street",
    primaryColor: "#16a34a",
    secondaryColor: "#a16207",
    previewBg: "#14231a",
    previewText: "#ecfdf3",
    defaultHeroModel: "gym-rings",
    headingFont: "Oswald",
    bodyFont: "Barlow",
  },
  {
    id: "gold",
    name: "Gold Elite",
    description: "Noir profond et or brossé, serif élégant — club privé et coaching haut de gamme.",
    layout: "salon",
    primaryColor: "#d4a437",
    secondaryColor: "#f5e6b3",
    previewBg: "#0b0906",
    previewText: "#f8f1dc",
    defaultHeroModel: "crown",
    headingFont: "Cormorant Garamond",
    bodyFont: "Inter",
  },
  {
    id: "cyber",
    name: "Cyber Pulse",
    description: "Cyan et magenta sur fond nuit, typographie tech — salle nouvelle génération.",
    layout: "platform",
    primaryColor: "#22d3ee",
    secondaryColor: "#e879f9",
    previewBg: "#070b16",
    previewText: "#e6f7ff",
    defaultHeroModel: "diamond",
    headingFont: "Orbitron",
    bodyFont: "Space Grotesk",
  },
  {
    id: "aurora",
    name: "Aurora Glass",
    description: "Dégradés aurore et verre dépoli, lumineux et moderne — studio boutique.",
    layout: "studio",
    primaryColor: "#6366f1",
    secondaryColor: "#2dd4bf",
    previewBg: "#f5f7ff",
    previewText: "#12142b",
    defaultHeroModel: "gold-dumbbell",
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

/** A current theme id OR a legacy id that still resolves (saved preferences keep working). */
export function isKnownThemeId(value: unknown): value is string {
  return typeof value === "string" && (isThemeId(value) || Object.prototype.hasOwnProperty.call(LEGACY_THEME_ALIASES, value));
}

/** Presets offered in pickers: everything except retired duplicates. */
export const SELECTABLE_THEME_PRESETS: ThemePreset[] = THEME_PRESETS.filter((t) => !t.retired);

/** For NEW choices (onboarding, design-change requests): a known theme that is not retired. */
export function isSelectableThemeId(value: unknown): value is string {
  return isKnownThemeId(value) && !THEME_PRESETS.some((t) => t.retired && t.id === resolveThemeId(value));
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

/**
 * What the owner picked for the homepage 3D slot: one of the built-in objects,
 * their own uploaded model ("custom"), or no 3D object at all ("none").
 * Stored in GymSettings.heroModel (null = the theme's default built-in object).
 */
export const HERO_SPECIAL_CHOICES = ["custom", "none"] as const;
export type HeroChoice = HeroModelId | (typeof HERO_SPECIAL_CHOICES)[number];

export function isHeroChoice(value: unknown): value is HeroChoice {
  return isHeroModelId(value) || (typeof value === "string" && (HERO_SPECIAL_CHOICES as readonly string[]).includes(value));
}

export function resolveHeroChoice(themeId: string | null | undefined, heroModel: string | null | undefined): HeroChoice {
  return isHeroChoice(heroModel) ? heroModel : getTheme(themeId).defaultHeroModel;
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
