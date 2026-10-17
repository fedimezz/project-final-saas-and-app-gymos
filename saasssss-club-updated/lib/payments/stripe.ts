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

export async function createStripeCheckoutSession({
  amount,
  currency,
  productName,
  customerEmail,
  clientReferenceId,
  metadata,
  successUrl,
  cancelUrl,
}: {
  amount: number;
  currency: string;
  productName: string;
  customerEmail?: string | null;
  clientReferenceId: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const currencyCode = currency.toLowerCase();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: currencyCode,
        unit_amount: toStripeMinorUnits(amount, currencyCode),
        product_data: { name: productName },
      },
      quantity: 1,
    }],
    customer_email: customerEmail || undefined,
    client_reference_id: clientReferenceId,
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}
