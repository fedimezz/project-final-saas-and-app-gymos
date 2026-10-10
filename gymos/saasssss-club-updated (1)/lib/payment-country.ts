import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";

countries.registerLocale(fr);

export const COUNTRY_OPTIONS = Object.keys(countries.getAlpha2Codes())
  .filter((code) => code !== "ZZ")
  .map((code) => ({ code, name: countries.getName(code, "fr") ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

export function detectPaymentCountry(headers: Headers): string | null {
  for (const value of [headers.get("x-vercel-ip-country"), headers.get("cf-ipcountry")]) {
    const code = value?.trim().toUpperCase();
    if (code && isSupportedPaymentCountry(code)) return code;
  }
  return null;
}

export function isSupportedPaymentCountry(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Z]{2}$/.test(value) &&
    value !== "XX" &&
    value !== "ZZ" &&
    countries.isValid(value);
}

export function isTunisia(countryCode: string): boolean {
  return countryCode.toUpperCase() === "TN";
}
