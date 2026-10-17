// POST /api/billing/reactivate — public, credential-checked.
//
// When a free trial ends the club is SUSPENDED and its members/owner can no
// longer sign in on the club host, so the owner could never reach
// /admin/billing to pay. This endpoint lets the OWNER prove who they are with
// email + password (no session) and either start a Stripe checkout or file a
// manual-payment request (Tunisia). Success/cancel return to the apex
// /reactivate page. Never reveals whether an email exists (same generic error).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { verifyOrigin } from "@/lib/csrf";
import { verifyPassword, dummyPasswordCheck } from "@/lib/bcrypt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { emailSchema, formatZodError } from "@/lib/validation";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { isSupportedPaymentCountry, isTunisia } from "@/lib/payment-country";
import { createManualPaymentRequest, manualPaymentInstructions, manualRequestFields } from "@/lib/manual-payment";

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  planId: manualRequestFields.planId,
  countryCode: z.string().trim().length(2).transform((c) => c.toUpperCase()),
  // "STRIPE" = pay by card now; "MANUAL" = transfer / D17 / Flouci / cash.
  payWith: z.enum(["STRIPE", "MANUAL"]),
  method: manualRequestFields.method.optional(),
  contactPhone: manualRequestFields.contactPhone.optional(),
  note: manualRequestFields.note,
});

const BAD_CREDENTIALS = "Email ou mot de passe incorrect, ou ce compte n'est pas propriétaire d'un club.";

export async function POST(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  const { email, password, planId, countryCode, payWith, method, contactPhone, note } = parsed.data;

  const ip = getClientIp(request);
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`reactivate-ip:${ip}`, 20, 15 * 60 * 1000),
    checkRateLimit(`reactivate-email:${email}`, 8, 15 * 60 * 1000),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const owner = await prisma.user.findFirst({
    where: { email, role: "OWNER", isActive: true, clubId: { not: null } },
    select: { id: true, email: true, password: true, clubId: true, club: { select: { id: true, slug: true, status: true } } },
  });
  const passwordOk = owner?.password ? await verifyPassword(password, owner.password) : await dummyPasswordCheck(password);
  if (!owner || !owner.clubId || !owner.club || !passwordOk) {
    return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
  }
  if (owner.club.status === "CANCELLED") {
    return NextResponse.json({ error: "Ce club a été résilié. Contactez le support." }, { status: 403 });
  }
  const clubId = owner.clubId;

  if (payWith === "MANUAL") {
    if (!method || !contactPhone) {
      return NextResponse.json({ error: "Choisissez une méthode et indiquez un numéro de téléphone." }, { status: 400 });
    }
    const result = await createManualPaymentRequest({ clubId, userId: owner.id, planId, method, contactPhone, note });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ manual: true, request: result.request, duplicate: result.duplicate, instructions: manualPaymentInstructions() });
  }

  // Card payment (Stripe) — not available for Tunisia.
  if (isTunisia(countryCode) || !isSupportedPaymentCountry(countryCode)) {
    return NextResponse.json({ error: "Le paiement par carte n'est pas disponible dans ce pays. Choisissez virement / D17 / Flouci." }, { status: 409 });
  }
  const [plan, subscription] = await Promise.all([
    prisma.saasPlan.findFirst({ where: { id: planId, isActive: true } }),
    prisma.clubSubscription.findUnique({ where: { clubId } }),
  ]);
  if (!plan || !subscription) return NextResponse.json({ error: "Plan ou abonnement introuvable" }, { status: 404 });
  if (plan.currency.toUpperCase() !== "USD" || !(plan.priceMonthly > 0)) {
    return NextResponse.json({ error: "Ce plan n'est pas payable en ligne." }, { status: 400 });
  }

  // Reuse an open checkout if one exists, otherwise create a fresh payment row.
  await prisma.saasPayment.updateMany({
    where: { clubId, subscriptionId: subscription.id, status: "PENDING", paymentProvider: "STRIPE" },
    data: { status: "FAILED" },
  });
  const payment = await prisma.saasPayment.create({
    data: {
      clubId, subscriptionId: subscription.id, amount: plan.priceMonthly, currency: plan.currency,
      status: "PENDING", paymentProvider: "STRIPE", countryCode,
    },
  });
  try {
    const base = (process.env.APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    const checkout = await createStripeCheckoutSession({
      amount: payment.amount,
      currency: payment.currency,
      productName: `ClubX ${plan.name} — abonnement mensuel`,
      customerEmail: owner.email,
      clientReferenceId: payment.id,
      metadata: { kind: "SAAS_PLAN", saasPaymentId: payment.id, subscriptionId: subscription.id, clubId, planId: plan.id, countryCode },
      successUrl: `${base}/reactivate?payment=success`,
      cancelUrl: `${base}/reactivate?payment=cancelled`,
    });
    await prisma.saasPayment.update({ where: { id: payment.id }, data: { providerRef: checkout.id } });
    return NextResponse.json({ paymentUrl: checkout.url });
  } catch (error) {
    console.error("reactivate checkout error:", error);
    await prisma.saasPayment.delete({ where: { id: payment.id } }).catch(() => undefined);
    return NextResponse.json({ error: "Impossible de créer la session de paiement. Réessayez." }, { status: 502 });
  }
}
