// lib/manual-payment.ts
//
// Manual (non-Stripe) SaaS subscription requests, for owners who cannot pay by card (Tunisia
// first). Three explicit steps, each done by SUPER_ADMIN, none of them automatic:
//
//   1. The club submits a request: selected plan + billing period (monthly / yearly).  → PENDING
//   2. SUPER_ADMIN approves or rejects it. Approving activates NOTHING.            → APPROVED / REJECTED
//   3. After verifying the payment (or the agreed terms) and recording a reference,
//      SUPER_ADMIN activates: a PAID SaasPayment is written, the subscription becomes
//      ACTIVE for the requested period and the club is re-opened.                  → CONFIRMED
//
// Steps 2 and 3 are single conditional UPDATEs (status = expected), so a double click, two admins
// or a replayed request can never activate twice. Shared by the owner route, the public
// reactivation route and the SUPER_ADMIN review route.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { findPlanForClub } from "@/lib/saas-plan-access";
import { sendEmail, escapeHtml } from "@/lib/email";
import { phoneSchema } from "@/lib/validation";
import { addBillingPeriod, billingPeriodSchema, periodStartFor, planPrice, BILLING_PERIOD_LABEL, type BillingPeriod } from "@/lib/billing-period";

import { MANUAL_METHODS, MANUAL_METHOD_LABEL, type ManualMethod } from "@/lib/manual-payment-shared";
export { MANUAL_METHODS, MANUAL_METHOD_LABEL };
export type { ManualMethod };

export const manualRequestFields = {
  planId: z.string().trim().min(1),
  billingPeriod: billingPeriodSchema.default("MONTHLY"),
  method: z.enum(MANUAL_METHODS),
  contactPhone: phoneSchema,
  note: z.string().trim().max(500).optional().or(z.literal("")),
};
export const manualRequestSchema = z.object(manualRequestFields);

/** Free text shown to the owner after a request (IBAN, D17 number, WhatsApp...). Set in env. */
export function manualPaymentInstructions(): string {
  return (
    process.env.MANUAL_PAYMENT_INSTRUCTIONS?.trim() ||
    "Notre équipe vous contacte sous 24 h au numéro indiqué pour finaliser le paiement."
  );
}

export type CreateManualResult =
  | { ok: true; request: { id: string; amount: number; currency: string; method: string; status: string; billingPeriod: BillingPeriod }; duplicate: boolean }
  | { ok: false; status: number; error: string };

export async function createManualPaymentRequest(input: {
  clubId: string;
  userId: string;
  planId: string;
  billingPeriod?: BillingPeriod;
  method: ManualMethod;
  contactPhone: string;
  note?: string;
}): Promise<CreateManualResult> {
  const billingPeriod = input.billingPeriod ?? "MONTHLY";
  const current = await prisma.clubSubscription.findUnique({ where: { clubId: input.clubId }, select: { planId: true } });
  const plan = await findPlanForClub(input.planId, current?.planId);
  if (!plan) return { ok: false, status: 404, error: "Plan introuvable ou indisponible" };
  // The amount is ALWAYS taken from the plan row for that period — never from the client.
  const price = planPrice(plan, billingPeriod);
  if (price === null) {
    return { ok: false, status: 400, error: `Ce plan n'est pas disponible en facturation ${BILLING_PERIOD_LABEL[billingPeriod].toLowerCase()}.` };
  }

  const summary = (r: { id: string; amount: number; currency: string; method: string; status: string; billingPeriod: BillingPeriod }) =>
    ({ id: r.id, amount: r.amount, currency: r.currency, method: r.method, status: r.status, billingPeriod: r.billingPeriod });

  const open = await prisma.manualPaymentRequest.findFirst({
    where: { clubId: input.clubId, status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (open) {
    // Already approved: the team is waiting for the payment — do not rewrite what was approved.
    if (open.status === "APPROVED") return { ok: true, duplicate: true, request: summary(open) };
    // Still pending: the latest choice of the owner wins (plan / period / method / phone).
    const updated = await prisma.manualPaymentRequest.update({
      where: { id: open.id, clubId: input.clubId, status: "PENDING" },
      data: {
        planId: plan.id,
        billingPeriod,
        method: input.method,
        contactPhone: input.contactPhone,
        note: input.note || null,
        amount: price,
        currency: plan.currency,
      },
    }).catch(() => null);
    return { ok: true, duplicate: true, request: summary(updated ?? open) };
  }

  const created = await prisma.manualPaymentRequest.create({
    data: {
      clubId: input.clubId,
      planId: plan.id,
      billingPeriod,
      requestedBy: input.userId,
      method: input.method,
      contactPhone: input.contactPhone,
      note: input.note || null,
      amount: price,
      currency: plan.currency,
    },
  });

  // Best-effort heads-up to the platform team; the request is already saved.
  const club = await prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true, slug: true } });
  alertPlatformOfManualRequest({
    clubName: club?.name ?? input.clubId, clubSlug: club?.slug ?? "", planName: plan.name,
    price, currency: plan.currency, billingPeriod, method: input.method, contactPhone: input.contactPhone, note: input.note,
  });

  return { ok: true, duplicate: false, request: summary(created) };
}

/** Fire-and-forget e-mail to the platform team for a new manual request (never throws, never blocks). */
export function alertPlatformOfManualRequest(r: {
  clubName: string; clubSlug: string; planName: string; price: number; currency: string;
  billingPeriod: BillingPeriod; method: string; contactPhone: string; note?: string | null; newClub?: boolean;
}): void {
  const to = process.env.PLATFORM_ALERT_EMAIL || process.env.SUPER_ADMIN_EMAIL;
  if (!to) return;
  void sendEmail({
    to,
    subject: `${r.newClub ? "Nouvelle inscription à payer hors Stripe" : "Nouvelle demande d'abonnement (hors Stripe)"} — ${r.clubName}`,
    html: `<p>Club <b>${escapeHtml(r.clubName)}</b> (${escapeHtml(r.clubSlug)}) demande le plan <b>${escapeHtml(r.planName)}</b> — ${r.price} ${escapeHtml(r.currency)} (${escapeHtml(BILLING_PERIOD_LABEL[r.billingPeriod].toLowerCase())}).</p>
<p>Méthode : ${escapeHtml(r.method)} · Téléphone : ${escapeHtml(r.contactPhone)}</p>
<p>${escapeHtml(r.note ?? "")}</p><p>À traiter dans /platform/manual-payments.</p>`,
  }).catch((e) => console.error("[manual-payment] alert email failed:", e instanceof Error ? e.message : e));
}

/** Step 2a — SUPER_ADMIN accepts the request. Activates nothing. False when it was no longer PENDING. */
export async function approveManualPaymentRequest(requestId: string, reviewerId: string, note?: string): Promise<boolean> {
  const res = await prisma.manualPaymentRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: { status: "APPROVED", reviewedBy: reviewerId, reviewNote: note || null, reviewedAt: new Date() },
  });
  return res.count === 1;
}

/** Step 2b — SUPER_ADMIN refuses (from PENDING, or from APPROVED if the payment never came). Activates nothing. */
export async function rejectManualPaymentRequest(requestId: string, reviewerId: string, note?: string): Promise<boolean> {
  const res = await prisma.manualPaymentRequest.updateMany({
    where: { id: requestId, status: { in: ["PENDING", "APPROVED"] } },
    data: { status: "REJECTED", reviewedBy: reviewerId, reviewNote: note || null, reviewedAt: new Date() },
  });
  return res.count === 1;
}

/**
 * Step 3 — activation. Only an APPROVED request can be activated, and only with a payment / agreement
 * reference. Writes a PAID SaasPayment, starts the requested period (monthly or yearly) on the
 * requested plan and re-opens the club. Returns false when the request is not APPROVED any more
 * (already activated, rejected, double click, race): nothing is written in that case.
 */
export async function activateManualPaymentRequest(
  requestId: string,
  reviewerId: string,
  input: { paymentReference: string; note?: string }
): Promise<{ ok: true; clubId: string } | { ok: false; reason: "NOT_APPROVED" | "CLUB_CANCELLED" }> {
  class ClubCancelled extends Error {}
  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const now = new Date();
    const claimed = await tx.manualPaymentRequest.updateMany({
      where: { id: requestId, status: "APPROVED" },
      data: {
        status: "CONFIRMED",
        paymentReference: input.paymentReference,
        verifiedBy: reviewerId,
        verifiedAt: now,
        ...(input.note ? { reviewNote: input.note } : {}),
      },
    });
    if (claimed.count !== 1) return { ok: false as const, reason: "NOT_APPROVED" as const };
    const req = await tx.manualPaymentRequest.findUniqueOrThrow({ where: { id: requestId } });
    // A club the platform banned (CANCELLED) is never re-opened by a payment: roll everything back.
    const target = await tx.club.findUnique({ where: { id: req.clubId }, select: { status: true } });
    if (!target || target.status === "CANCELLED") throw new ClubCancelled();
    const subscription = await tx.clubSubscription.findUniqueOrThrow({ where: { clubId: req.clubId } });

    // Renewing the same plan early continues from the end of the running period (no paid day is lost).
    const periodStart = periodStartFor(subscription, req.planId, now);
    const periodEnd = addBillingPeriod(periodStart, req.billingPeriod);

    await tx.saasPayment.create({
      data: {
        clubId: req.clubId,
        subscriptionId: subscription.id,
        amount: req.amount,
        currency: req.currency,
        status: "PAID",
        paymentProvider: "MANUAL",
        providerRef: `manual:${req.id}`,
        billingPeriod: req.billingPeriod,
        paidAt: now,
      },
    });
    await tx.clubSubscription.update({
      where: { id: subscription.id },
      data: { planId: req.planId, billingPeriod: req.billingPeriod, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: null },
    });
    await tx.club.updateMany({
      where: { id: req.clubId, status: { not: "CANCELLED" } },
      data: { status: "ACTIVE", trialEndsAt: null, suspendedAt: null, suspendedReason: null },
    });
    return { ok: true as const, clubId: req.clubId };
  });
  } catch (e) {
    if (e instanceof ClubCancelled) return { ok: false, reason: "CLUB_CANCELLED" };
    throw e;
  }
}
