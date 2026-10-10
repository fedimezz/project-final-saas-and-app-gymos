// Local persistence for "My clubs". Club directory info (name, slug, logo, API
// host) is public, so it lives in plain AsyncStorage — only the session token
// goes in SecureStore (src/lib/storage.ts). Everything read back is re-validated:
// a corrupted or tampered entry is dropped instead of being trusted, and in
// production a non-HTTPS host is never accepted.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PREF_KEYS, isAllowedUrl, normalizeBaseUrl } from "@/config";
import type { ClubRef } from "@/api/types";
import { MAX_SAVED_CLUBS } from "@/lib/clubOrder";

export { sortClubs, upsertClub } from "@/lib/clubOrder";

function toClubRef(value: unknown): ClubRef | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (typeof c.slug !== "string" || !c.slug || typeof c.name !== "string" || typeof c.apiBaseUrl !== "string") return null;
  const apiBaseUrl = normalizeBaseUrl(c.apiBaseUrl);
  if (!isAllowedUrl(apiBaseUrl)) return null;
  return { slug: c.slug, name: c.name, logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null, apiBaseUrl };
}

async function readJson(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loadSavedClubs(): Promise<ClubRef[]> {
  const data = await readJson(PREF_KEYS.savedClubs);
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const clubs: ClubRef[] = [];
  for (const item of data) {
    const club = toClubRef(item);
    if (club && !seen.has(club.slug)) {
      seen.add(club.slug);
      clubs.push(club);
    }
  }
  return clubs.slice(0, MAX_SAVED_CLUBS);
}

export async function persistSavedClubs(clubs: ClubRef[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEYS.savedClubs, JSON.stringify(clubs.slice(0, MAX_SAVED_CLUBS)));
  } catch {
    /* best-effort: the in-memory list still works for this session */
  }
}

export async function loadSlug(key: typeof PREF_KEYS.lastClub | typeof PREF_KEYS.homeClubSlug): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v && v.length < 200 ? v : null;
  } catch {
    return null;
  }
}

export async function persistSlug(key: typeof PREF_KEYS.lastClub | typeof PREF_KEYS.homeClubSlug, slug: string | null): Promise<void> {
  try {
    if (slug) await AsyncStorage.setItem(key, slug);
    else await AsyncStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}
