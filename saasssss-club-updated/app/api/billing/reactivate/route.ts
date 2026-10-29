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
import { findPlanForClub } from "@/lib/saas-plan-access";
import { billingPeriodSchema, planPrice } from "@/lib/billing-period";
import { SUBSCRIPTION_EXPIRED_REASON } from "@/lib/subscription-expiry";
import { decideRecurring, isRecurringEnabled, stripeIntervalFor } from "@/lib/saas-recurring";
import { AWAITING_MANUAL_PAYMENT_REASON } from "@/lib/manual-payment-shared";
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
  billingPeriod: billingPeriodSchema.default("MONTHLY"),
  countryCode: z.string().trim().length(2).transform((c) => c.toUpperCase()),
  // "STRIPE" = pay by card now; "MANUAL" = transfer / D17 / Flouci / cash.
  payWith: z.enum(["STRIPE", "MANUAL"]),
  method: manualRequestFields.method.optional(),
  contactPhone: manualRequestFields.contactPhone.optional(),
  note: manualRequestFields.note,
});

// suspendedReason values written by the trial-check and subscription-renewal crons.
const SELF_SERVICE_SUSPENSIONS = ["Trial expired", "Payment past due", SUBSCRIPTION_EXPIRED_REASON, AWAITING_MANUAL_PAYMENT_REASON];

const BAD_CREDENTIALS = "Email ou mot de passe incorrect, ou ce compte n'est pas propriétaire d'un club.";

export async function POST(request: NextRequest) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  const { email, password, planId, billingPeriod, countryCode, payWith, method, contactPhone, note } = parsed.data;

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
    select: { id: true, email: true, password: true, clubId: true, club: { select: { id: true, slug: true, status: true, suspendedReason: true } } },
  });
  const passwordOk = owner?.password ? await verifyPassword(password, owner.password) : await dummyPasswordCheck(password);
  if (!owner || !owner.clubId || !owner.club || !passwordOk) {
    return NextResponse.json({ error: BAD_CREDENTIALS }, { status: 401 });
  }
  if (owner.club.status === "CANCELLED") {
    return NextResponse.json({ error: "Ce club a été résilié. Contactez le support." }, { status: 403 });
  }
  // Paying reactivates a club that lapsed on its own (trial / past due). A club the platform
  // suspended for another reason (abuse, fraud...) must go through support, not a payment.
  if (owner.club.status === "SUSPENDED" && owner.club.suspendedReason && !SELF_SERVICE_SUSPENSIONS.includes(owner.club.suspendedReason)) {
    return NextResponse.json({ error: "Ce club a été suspendu par la plateforme. Contactez le support." }, { status: 403 });
  }
  const clubId = owner.clubId;

  if (payWith === "MANUAL") {
    if (!method || !contactPhone) {
      return NextResponse.json({ error: "Choisissez une méthode et indiquez un numéro de téléphone." }, { status: 400 });
    }
    const result = await createManualPaymentRequest({ clubId, userId: owner.id, planId, billingPeriod, method, contactPhone, note });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ manual: true, request: result.request, duplicate: result.duplicate, instructions: manualPaymentInstructions() });
  }

  // Card payment (Stripe) — not available for Tunisia.
  if (isTunisia(countryCode) || !isSupportedPaymentCountry(countryCode)) {
    return NextResponse.json({ error: "Le paiement par carte n'est pas disponible dans ce pays. Choisissez virement / D17 / Flouci." }, { status: 409 });
  }
  const subscription = await prisma.clubSubscription.findUnique({ where: { clubId } });
  const plan = subscription ? await findPlanForClub(planId, subscription.planId) : null;
  if (!plan || !subscription) return NextResponse.json({ error: "Plan ou abonnement introuvable" }, { status: 404 });
  const price = planPrice(plan, billingPeriod);
  if (plan.currency.toUpperCase() !== "USD" || price === null) {
    return NextResponse.json({ error: "Ce plan n'est pas payable en ligne pour cette période." }, { status: 400 });
  }

  // Reuse an open checkout if one exists, otherwise create a fresh payment row.
  // Auto-renewing Stripe Subscription or one-time payment (STRIPE_RECURRING_ENABLED, default off).
  const decision = decideRecurring(isRecurringEnabled(), subscription, plan.id, billingPeriod);
  if (decision.blocked) return NextResponse.json({ error: decision.blocked }, { status: 409 });
  const recurring = decision.recurring;
  await prisma.saasPayment.updateMany({
    where: { clubId, subscriptionId: subscription.id, status: "PENDING", paymentProvider: "STRIPE" },
    data: { status: "FAILED" },
  });
  const payment = await prisma.saasPayment.create({
    data: {
      clubId, subscriptionId: subscription.id, amount: price, currency: plan.currency,
      status: "PENDING", paymentProvider: "STRIPE", countryCode, billingPeriod,
    },
  });
  try {
    const base = (process.env.APP_URL || request.nextUrl.origin).replace(/\/$/, "");
    const checkout = await createStripeCheckoutSession({
      amount: payment.amount,
      currency: payment.currency,
      productName: `ClubX ${plan.name} — abonnement ${billingPeriod === "YEARLY" ? "annuel" : "mensuel"}`,
      customerEmail: owner.email,
      clientReferenceId: payment.id,
      metadata: { kind: "SAAS_PLAN", saasPaymentId: payment.id, subscriptionId: subscription.id, clubId, planId: plan.id, countryCode, billingPeriod, recurring: recurring ? "true" : "false" },
      ...(recurring ? { recurring: { interval: stripeIntervalFor(billingPeriod) } } : {}),
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
