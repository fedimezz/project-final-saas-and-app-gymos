import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";

countries.registerLocale(fr);

export const PAYMENT_COUNTRIES = Object.keys(countries.getAlpha2Codes())
  .filter((code) => code !== "ZZ")
  .map((code) => ({ code, name: countries.getName(code, "fr") ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

export function getPaymentCountryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return countries.getName(code, "fr") ?? code;
}
