// Pure helpers for the saved-clubs list (no React Native imports → unit-testable in Node).
import type { ClubRef } from "@/api/types";

export const MAX_SAVED_CLUBS = 20;

/** Adds or refreshes a club (newest data wins) without reordering existing entries. */
export function upsertClub(list: ClubRef[], club: ClubRef): ClubRef[] {
  const exists = list.some((c) => c.slug === club.slug);
  return exists ? list.map((c) => (c.slug === club.slug ? club : c)) : [...list, club].slice(-MAX_SAVED_CLUBS);
}

/**
 * Display order: the club the user is authenticated in first, then the last
 * one selected, then the rest alphabetically.
 */
export function sortClubs(list: ClubRef[], homeSlug: string | null, lastSlug: string | null): ClubRef[] {
  const rank = (c: ClubRef) => (c.slug === homeSlug ? 0 : c.slug === lastSlug ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
}
