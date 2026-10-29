import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(key);
  return client;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return secret;
}

export function toStripeMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payment amount");
  const normalizedCurrency = currency.toLowerCase();
  if (!/^[a-z]{3}$/.test(normalizedCurrency)) throw new Error("Invalid payment currency");
  const noDecimal = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
  const multiplier = noDecimal.has(normalizedCurrency) ? 1 : 100;
  const scaledAmount = amount * multiplier;
  const value = Math.round(scaledAmount);
  if (Math.abs(scaledAmount - value) > 1e-7) throw new Error("Payment amount has unsupported decimal precision");
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("Payment amount is below the currency minimum");
  return value;
}

/** Inverse of toStripeMinorUnits: Stripe's integer amount → major units for the ledger. */
export function fromStripeMinorUnits(minor: number, currency: string): number {
  const noDecimal = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
  return noDecimal.has(currency.toLowerCase()) ? minor : minor / 100;
}

export async function createStripeCheckoutSession({
  amount,
  currency,
  productName,
  customerEmail,
  clientReferenceId,
  metadata,
  successUrl,
  cancelUrl,
  recurring,
}: {
  amount: number;
  currency: string;
  productName: string;
  customerEmail?: string | null;
  clientReferenceId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  /** Auto-renewing Stripe Subscription (month / year) instead of a one-time payment. */
  recurring?: { interval: "month" | "year" };
}): Promise<{ id: string; url: string }> {
  const currencyCode = currency.toLowerCase();
  const session = await getStripe().checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    line_items: [{
      price_data: {
        currency: currencyCode,
        unit_amount: toStripeMinorUnits(amount, currencyCode),
        product_data: { name: productName },
        ...(recurring ? { recurring: { interval: recurring.interval } } : {}),
      },
      quantity: 1,
    }],
    // The same metadata on the Stripe Subscription itself, so renewal invoices can be tied back to the club.
    ...(recurring ? { subscription_data: { metadata } } : {}),
    customer_email: customerEmail || undefined,
    client_reference_id: clientReferenceId,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}

/** Stops an auto-renewing Stripe Subscription immediately (used when the club switches to a new one). */
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  await getStripe().subscriptions.cancel(subscriptionId);
}

/** Stripe-hosted page where the club updates its card or cancels auto-renewal. */
export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  const session = await getStripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return { url: session.url };
}
