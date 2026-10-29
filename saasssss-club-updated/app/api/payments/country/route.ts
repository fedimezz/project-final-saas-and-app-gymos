import { NextRequest, NextResponse } from "next/server";
import { detectPaymentCountry } from "@/lib/payment-country";
import { isStripeConfigured } from "@/lib/payments/availability";

// Public. Tells onboarding (1) the visitor's detected country and (2) whether card payment (Stripe) is
// configured on this deployment, so the plan step can offer "pay by card" or fall back to "contact us".
export async function GET(request: NextRequest) {
  return NextResponse.json({ countryCode: detectPaymentCountry(request.headers), stripeEnabled: isStripeConfigured() }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
