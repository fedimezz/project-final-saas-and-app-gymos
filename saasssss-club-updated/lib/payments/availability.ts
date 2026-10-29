// lib/payments/availability.ts
//
// Single source of truth for "can this deployment take a card payment (Stripe) right now?".
// Card checkout needs BOTH the secret key (to create the Checkout session) and the webhook secret
// (the only thing that activates a club after payment). If either is missing we must not send the
// owner to a checkout that can never complete — onboarding falls back to "contact us / pay without card".

export function isStripeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean((env.STRIPE_SECRET_KEY || "").trim() && (env.STRIPE_WEBHOOK_SECRET || "").trim());
}

/**
 * Card payment is offered for a signup only when Stripe is configured AND the owner's country is not
 * Tunisia (no card checkout there; those clubs use the free trial or the contact / manual route).
 */
export function isCardPaymentAvailable(
  countryCode: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if ((countryCode || "").toUpperCase() === "TN") return false;
  return isStripeConfigured(env);
}
