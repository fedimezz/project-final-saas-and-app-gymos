// The club's identity as the app needs it: name, logo, brand colors, website
// theme and 3D hero — all read from the public settings the club owner sets on
// the website (/api/settings/public). Pure functions (no React Native imports)
// so they are unit-tested in tests/clubBrand.test.ts.
//
// The server is not trusted blindly: every field is validated and clamped, so a
// malformed / newer payload degrades to a safe default instead of crashing the
// screen or the 3D viewer.

export type HeroMode = "builtin" | "custom" | "none";

export interface HeroTransform {
  scale: number;
  rotation: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  autoRotate: boolean;
}

export interface ClubBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Website theme id (e.g. "boxing", "yoga"); decorative here, validated as a short slug. */
  themeId: string;
  /** Built-in 3D object id, or null when the server did not send a usable one. */
  heroModel: string | null;
  heroMode: HeroMode;
  /** The club's own uploaded model (only when heroMode === "custom"). */
  customModel: { url: string; byteSize: number; transform: HeroTransform } | null;
}

/** Biggest custom model the phone will download and parse (the web allows more). */
export const MAX_CUSTOM_MODEL_BYTES = 3 * 1024 * 1024;

const DEFAULT_TRANSFORM: HeroTransform = {
  scale: 1,
  rotation: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0, z: 0 },
  autoRotate: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const SLUG = /^[a-z0-9-]{1,32}$/;
// Same-origin path the website serves the model from; anything else is refused.
const MODEL_PATH = /^\/api\/hero-model\?v=[a-f0-9]{8,64}$/;

const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

function parseTransform(raw: unknown): HeroTransform {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const r = (t.rotation && typeof t.rotation === "object" ? t.rotation : {}) as Record<string, unknown>;
  const p = (t.position && typeof t.position === "object" ? t.position : {}) as Record<string, unknown>;
  return {
    scale: num(t.scale, 0.2, 3, 1),
    rotation: { x: num(r.x, -180, 180, 0), y: num(r.y, -180, 180, 0), z: num(r.z, -180, 180, 0) },
    position: { x: num(p.x, -2, 2, 0), y: num(p.y, -2, 2, 0), z: num(p.z, -2, 2, 0) },
    autoRotate: typeof t.autoRotate === "boolean" ? t.autoRotate : DEFAULT_TRANSFORM.autoRotate,
  };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const hex = (v: unknown): string | null => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null);

/**
 * Any /api/settings/public payload → a safe ClubBrand.
 * `supportedModels` is the list the 3D viewer can draw (generated from the website).
 */
export function parseClubBrand(raw: unknown, supportedModels: readonly string[]): ClubBrand {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const logo = str(s.logoUrl);
  const heroModelRaw = str(s.heroModel);
  const heroModel = heroModelRaw && supportedModels.includes(heroModelRaw) ? heroModelRaw : null;

  let heroMode: HeroMode = s.heroMode === "custom" || s.heroMode === "none" ? s.heroMode : "builtin";
  let customModel: ClubBrand["customModel"] = null;
  if (heroMode === "custom") {
    const c = (s.heroCustomModel && typeof s.heroCustomModel === "object" ? s.heroCustomModel : {}) as Record<string, unknown>;
    const url = str(c.url);
    const byteSize = typeof c.byteSize === "number" ? c.byteSize : Number.NaN;
    // The server only accepts self-contained files, so both formats parse without any extra request.
    const formatOk = c.format === "glb" || c.format === "gltf";
    if (url && MODEL_PATH.test(url) && formatOk && byteSize > 0 && byteSize <= MAX_CUSTOM_MODEL_BYTES) {
      customModel = { url, byteSize, transform: parseTransform(c.transform) };
    } else {
      heroMode = "builtin"; // too big / unsupported / malformed → the club's built-in object instead
    }
  }

  const themeIdRaw = str(s.themeId);
  return {
    name: str(s.name) ?? "",
    logoUrl: logo && /^https?:\/\//i.test(logo) ? logo : null,
    primaryColor: hex(s.primaryColor),
    secondaryColor: hex(s.secondaryColor),
    themeId: themeIdRaw && SLUG.test(themeIdRaw) ? themeIdRaw : "modern",
    heroModel,
    heroMode,
    customModel,
  };
}

/** What the hero area should show. */
export type HeroPlan =
  | { kind: "none" }
  | { kind: "builtin"; model: string }
  | { kind: "custom"; model: string; url: string; transform: HeroTransform };

export function heroPlan(brand: ClubBrand | null): HeroPlan {
  if (!brand || brand.heroMode === "none") return { kind: "none" };
  const model = brand.heroModel ?? "dumbbell";
  if (brand.heroMode === "custom" && brand.customModel) {
    // `model` stays as the fallback the viewer shows if the file cannot be parsed.
    return { kind: "custom", model, url: brand.customModel.url, transform: brand.customModel.transform };
  }
  return { kind: "builtin", model };
}
