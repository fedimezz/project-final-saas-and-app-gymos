export const MEMBERSHIP_CURRENCIES = ["TND", "USD", "EUR", "GBP", "CAD", "CHF"] as const;
export type MembershipCurrency = (typeof MEMBERSHIP_CURRENCIES)[number];

export const STRIPE_MEMBERSHIP_CURRENCIES: readonly MembershipCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "CHF",
];

export function isMembershipCurrency(value: unknown): value is MembershipCurrency {
  return typeof value === "string" && MEMBERSHIP_CURRENCIES.some((currency) => currency === value);
}

export function canStripeChargeMembershipCurrency(value: string): boolean {
  return STRIPE_MEMBERSHIP_CURRENCIES.some((currency) => currency === value);
}

export function isValidMembershipPrice(amount: number, currency: string): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const factor = currency === "TND" ? 1000 : 100;
  return Math.abs(amount * factor - Math.round(amount * factor)) < 1e-7;
}

export function formatMembershipPrice(amount: number, currency: string, locale = "fr-FR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "TND" ? 3 : 2,
  }).format(amount);
}
