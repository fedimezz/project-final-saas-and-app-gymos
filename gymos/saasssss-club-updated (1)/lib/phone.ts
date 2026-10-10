// lib/phone.ts
//
// Pure E.164 helpers (no env, no Node APIs) shared by the API routes, the
// SMS sender and the client-side <PhoneInput />.
import { dialCodeOf } from "@/lib/countries";

/**
 * Normalises a user-typed phone number to E.164 ("+21620123456"), or null when
 * it can't be a valid number.
 *
 * - "+…" and "00…" are treated as already international.
 * - With `defaultCountry`, a national number is prefixed with that country's
 *   calling code (a leading trunk "0" is dropped: "06 12 34 56 78" + FR →
 *   "+33612345678").
 * - Without it, an 8-digit local number is assumed Tunisian (historic default).
 */
export function toE164(raw: string, defaultCountry?: string | null): string | null {
  let n = raw.replace(/[\s\-().]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;

  if (!n.startsWith("+")) {
    const dial = defaultCountry ? dialCodeOf(defaultCountry) : null;
    if (dial) {
      n = `+${dial}${n.replace(/^0+/, "")}`;
    } else if (/^\d{8}$/.test(n)) {
      n = `+216${n}`;
    }
  }

  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
