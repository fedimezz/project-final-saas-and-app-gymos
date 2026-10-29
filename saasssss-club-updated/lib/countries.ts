// lib/countries.ts
//
// ISO 3166-1 alpha-2 country codes with their international calling codes.
// Pure data + helpers, no server-only imports, so the same list feeds the
// server-side Zod validation (lib/validation.ts) and the <PhoneInput /> and
// country selectors on the client.
//
// Country NAMES are not stored: they are produced at runtime in the requested
// locale with Intl.DisplayNames (French by default — the product is
// French-first), which keeps this file small and always correctly localised.

// [ISO alpha-2, calling code without "+"]
const COUNTRY_DIAL_CODES: ReadonlyArray<readonly [string, string]> = [
  ["AD", "376"], ["AE", "971"], ["AF", "93"], ["AL", "355"], ["AM", "374"], ["AO", "244"],
  ["AR", "54"], ["AT", "43"], ["AU", "61"], ["AZ", "994"], ["BA", "387"], ["BD", "880"],
  ["BE", "32"], ["BF", "226"], ["BG", "359"], ["BH", "973"], ["BI", "257"], ["BJ", "229"],
  ["BN", "673"], ["BO", "591"], ["BR", "55"], ["BT", "975"], ["BW", "267"], ["BY", "375"],
  ["CA", "1"], ["CD", "243"], ["CF", "236"], ["CG", "242"], ["CH", "41"], ["CI", "225"],
  ["CL", "56"], ["CM", "237"], ["CN", "86"], ["CO", "57"], ["CR", "506"], ["CU", "53"],
  ["CV", "238"], ["CY", "357"], ["CZ", "420"], ["DE", "49"], ["DJ", "253"], ["DK", "45"],
  ["DO", "1"], ["DZ", "213"], ["EC", "593"], ["EE", "372"], ["EG", "20"], ["ER", "291"],
  ["ES", "34"], ["ET", "251"], ["FI", "358"], ["FR", "33"], ["GA", "241"], ["GB", "44"],
  ["GE", "995"], ["GH", "233"], ["GM", "220"], ["GN", "224"], ["GQ", "240"], ["GR", "30"],
  ["GT", "502"], ["GW", "245"], ["GY", "592"], ["HK", "852"], ["HN", "504"], ["HR", "385"],
  ["HT", "509"], ["HU", "36"], ["ID", "62"], ["IE", "353"], ["IL", "972"], ["IN", "91"],
  ["IQ", "964"], ["IR", "98"], ["IS", "354"], ["IT", "39"], ["JM", "1"], ["JO", "962"],
  ["JP", "81"], ["KE", "254"], ["KG", "996"], ["KH", "855"], ["KM", "269"], ["KR", "82"],
  ["KW", "965"], ["KZ", "7"], ["LA", "856"], ["LB", "961"], ["LI", "423"], ["LK", "94"],
  ["LR", "231"], ["LS", "266"], ["LT", "370"], ["LU", "352"], ["LV", "371"], ["LY", "218"],
  ["MA", "212"], ["MC", "377"], ["MD", "373"], ["ME", "382"], ["MG", "261"], ["MK", "389"],
  ["ML", "223"], ["MM", "95"], ["MN", "976"], ["MO", "853"], ["MR", "222"], ["MT", "356"],
  ["MU", "230"], ["MV", "960"], ["MW", "265"], ["MX", "52"], ["MY", "60"], ["MZ", "258"],
  ["NA", "264"], ["NE", "227"], ["NG", "234"], ["NI", "505"], ["NL", "31"], ["NO", "47"],
  ["NP", "977"], ["NZ", "64"], ["OM", "968"], ["PA", "507"], ["PE", "51"], ["PG", "675"],
  ["PH", "63"], ["PK", "92"], ["PL", "48"], ["PS", "970"], ["PT", "351"], ["PY", "595"],
  ["QA", "974"], ["RO", "40"], ["RS", "381"], ["RU", "7"], ["RW", "250"], ["SA", "966"],
  ["SC", "248"], ["SD", "249"], ["SE", "46"], ["SG", "65"], ["SI", "386"], ["SK", "421"],
  ["SL", "232"], ["SN", "221"], ["SO", "252"], ["SR", "597"], ["SS", "211"], ["SV", "503"],
  ["SY", "963"], ["SZ", "268"], ["TD", "235"], ["TG", "228"], ["TH", "66"], ["TJ", "992"],
  ["TM", "993"], ["TN", "216"], ["TR", "90"], ["TT", "1"], ["TW", "886"], ["TZ", "255"],
  ["UA", "380"], ["UG", "256"], ["US", "1"], ["UY", "598"], ["UZ", "998"], ["VE", "58"],
  ["VN", "84"], ["XK", "383"], ["YE", "967"], ["ZA", "27"], ["ZM", "260"], ["ZW", "263"],
];

const DIAL_BY_COUNTRY = new Map<string, string>(COUNTRY_DIAL_CODES);

/** Default country: the product's home market. */
export const DEFAULT_COUNTRY = "TN";

/** Shown first in selectors — the club's core audience (Tunisia + neighbours + diaspora). */
export const PRIORITY_COUNTRIES = ["TN", "FR", "DZ", "MA", "LY", "EG", "SA", "AE", "QA", "DE", "IT", "CA", "US", "GB"] as const;

export interface Country {
  code: string; // ISO 3166-1 alpha-2, upper-case
  dialCode: string; // without "+"
  name: string; // localised
  flag: string; // emoji
}

export function isValidCountryCode(code: string): boolean {
  return DIAL_BY_COUNTRY.has(code.toUpperCase());
}

export function dialCodeOf(code: string): string | null {
  return DIAL_BY_COUNTRY.get(code.toUpperCase()) ?? null;
}

/** "TN" → "🇹🇳" (regional-indicator pair). Empty string for anything that is not 2 letters. */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(
    ...code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

function regionName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Full list, localised and sorted (priority countries first, then A→Z). */
export function listCountries(locale = "fr"): Country[] {
  const all: Country[] = COUNTRY_DIAL_CODES.map(([code, dialCode]) => ({
    code,
    dialCode,
    name: regionName(code, locale),
    flag: flagEmoji(code),
  }));
  const priority = PRIORITY_COUNTRIES.map((c) => all.find((x) => x.code === c)).filter(
    (x): x is Country => Boolean(x)
  );
  const rest = all
    .filter((c) => !(PRIORITY_COUNTRIES as readonly string[]).includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  return [...priority, ...rest];
}

/**
 * Best-guess country for an E.164 number, by longest calling-code prefix.
 * Shared codes resolve to the first-listed owner (+1 → CA, +7 → KZ), which is
 * only used to pre-select the flag when editing a stored number.
 */
export function countryFromE164(e164: string): string | null {
  if (!e164.startsWith("+")) return null;
  const digits = e164.slice(1);
  for (let len = 3; len >= 1; len--) {
    const prefix = digits.slice(0, len);
    const match = COUNTRY_DIAL_CODES.find(([, dial]) => dial === prefix);
    if (match) return match[0];
  }
  return null;
}
