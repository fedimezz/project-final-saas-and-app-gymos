// Coach profile form rules — same limits as the server (PATCH
// /api/dashboard/coach/profile). The server stays the authority; this just
// gives the message before a round trip.
export const MAX_BIO = 1000;
export const MAX_SPECIALTIES = 8;
export const MAX_SPECIALTY_LENGTH = 40;

/** "Boxe, Cardio ,boxe\nYoga" → ["Boxe", "Cardio", "Yoga"] (case-insensitive de-dup, order kept). */
export function parseSpecialties(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function formatSpecialties(list: readonly string[]): string {
  return list.join(", ");
}

export function validateBio(v: string): string | null {
  return v.trim().length > MAX_BIO ? `La bio ne peut pas dépasser ${MAX_BIO} caractères` : null;
}

export function validateSpecialties(text: string): string | null {
  const list = parseSpecialties(text);
  if (list.length > MAX_SPECIALTIES) return `Maximum ${MAX_SPECIALTIES} spécialités`;
  if (list.some((s) => s.length > MAX_SPECIALTY_LENGTH)) return `Une spécialité ne peut pas dépasser ${MAX_SPECIALTY_LENGTH} caractères`;
  return null;
}

const PHONE_RE = /^[+]?[\d\s\-().]{7,20}$/;

/** 2–100 characters, like the server's nameSchema. */
export function validateCoachName(v: string): string | null {
  const t = v.trim();
  if (t.length < 2) return "Le nom doit contenir au moins 2 caractères";
  return t.length > 100 ? "Le nom est trop long" : null;
}

/** Clearing the phone is allowed (the server stores it as empty). */
export function validateCoachPhone(v: string): string | null {
  const t = v.trim();
  if (t === "") return null;
  return PHONE_RE.test(t) ? null : "Format de téléphone invalide";
}
