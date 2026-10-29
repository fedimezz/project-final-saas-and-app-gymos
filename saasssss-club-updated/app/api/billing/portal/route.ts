// POST /api/billing/portal — OWNER only. Returns the Stripe-hosted page where the club updates its card or
// cancels auto-renewal (needs the Customer Portal enabled in the Stripe dashboard). The Stripe customer is
// ALWAYS read from the caller's own club subscription — never from the request.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { createBillingPortalSession } from "@/lib/payments/stripe";
import { buildTenantOrigin } from "@/lib/tenant-url";

export async function POST(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
  const clubId = auth.user.clubId;
  if (!clubId) return NextResponse.json({ error: "Aucun club associé" }, { status: 400 });

  try {
    const [subscription, club] = await Promise.all([
      prisma.clubSubscription.findUnique({ where: { clubId }, select: { providerCustomerId: true, providerSubscriptionId: true } }),
      prisma.club.findUnique({ where: { id: clubId }, select: { slug: true, customDomain: true } }),
    ]);
    if (!subscription?.providerCustomerId || !subscription.providerSubscriptionId || !club) {
      return NextResponse.json({ error: "Aucun abonnement à renouvellement automatique pour ce club." }, { status: 404 });
    }
    const origin = buildTenantOrigin(club, process.env.APP_URL || request.nextUrl.origin);
    const session = await createBillingPortalSession(subscription.providerCustomerId, `${origin}/admin/billing`);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("billing portal error:", error);
    return NextResponse.json({ error: "Impossible d'ouvrir la gestion de l'abonnement. Réessayez." }, { status: 502 });
  }
}
