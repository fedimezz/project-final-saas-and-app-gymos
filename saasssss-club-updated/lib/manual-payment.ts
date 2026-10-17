// lib/manual-payment.ts
//
// Manual (non-Stripe) SaaS payments, for owners in countries Stripe cannot
// serve (Tunisia first). The owner asks to pay by bank transfer / D17 /
// Flouci / cash; the platform team confirms once the money arrived, which
// activates the club's subscription for one month (same effect as the Stripe
// webhook). Shared by the owner route, the public reactivation route and the
// SUPER_ADMIN review route.
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sendEmail, escapeHtml } from "@/lib/email";
import { phoneSchema } from "@/lib/validation";

import { MANUAL_METHODS, MANUAL_METHOD_LABEL, type ManualMethod } from "@/lib/manual-payment-shared";
export { MANUAL_METHODS, MANUAL_METHOD_LABEL };
export type { ManualMethod };

export const manualRequestFields = {
  planId: z.string().trim().min(1),
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
  | { ok: true; request: { id: string; amount: number; currency: string; method: string; status: string }; duplicate: boolean }
  | { ok: false; status: number; error: string };

export async function createManualPaymentRequest(input: {
  clubId: string;
  userId: string;
  planId: string;
  method: ManualMethod;
  contactPhone: string;
  note?: string;
}): Promise<CreateManualResult> {
  const plan = await prisma.saasPlan.findFirst({ where: { id: input.planId, isActive: true } });
  if (!plan) return { ok: false, status: 404, error: "Plan introuvable ou inactif" };
  if (!Number.isFinite(plan.priceMonthly) || plan.priceMonthly <= 0) {
    return { ok: false, status: 400, error: "Ce plan ne possède pas de prix mensuel payable." };
  }

  const pending = await prisma.manualPaymentRequest.findFirst({
    where: { clubId: input.clubId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    return {
      ok: true,
      duplicate: true,
      request: { id: pending.id, amount: pending.amount, currency: pending.currency, method: pending.method, status: pending.status },
    };
  }

  const created = await prisma.manualPaymentRequest.create({
    data: {
      clubId: input.clubId,
      planId: plan.id,
      requestedBy: input.userId,
      method: input.method,
      contactPhone: input.contactPhone,
      note: input.note || null,
      amount: plan.priceMonthly,
      currency: plan.currency,
    },
  });

  // Best-effort heads-up to the platform team; the request is already saved.
  const to = process.env.PLATFORM_ALERT_EMAIL || process.env.SUPER_ADMIN_EMAIL;
  if (to) {
    const club = await prisma.club.findUnique({ where: { id: input.clubId }, select: { name: true, slug: true } });
    void sendEmail({
      to,
      subject: `Nouvelle demande de paiement manuel — ${club?.name ?? input.clubId}`,
      html: `<p>Club <b>${escapeHtml(club?.name ?? "")}</b> (${escapeHtml(club?.slug ?? "")}) demande le plan <b>${escapeHtml(plan.name)}</b> — ${plan.priceMonthly} ${escapeHtml(plan.currency)}/mois.</p>
<p>Méthode : ${escapeHtml(input.method)} · Téléphone : ${escapeHtml(input.contactPhone)}</p>
<p>${escapeHtml(input.note ?? "")}</p><p>À valider dans /platform/manual-payments.</p>`,
    }).catch((e) => console.error("[manual-payment] alert email failed:", e instanceof Error ? e.message : e));
  }

  return {
    ok: true,
    duplicate: false,
    request: { id: created.id, amount: created.amount, currency: created.currency, method: created.method, status: created.status },
  };
}

/**
 * Confirms a PENDING request: records a PAID SaasPayment, activates the club's
 * subscription on the requested plan for one month and re-opens the club.
 * Returns false when the request was no longer pending (double click / race).
 */
export async function confirmManualPaymentRequest(requestId: string, reviewerId: string, note?: string): Promise<boolean> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await tx.manualPaymentRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "CONFIRMED", reviewedBy: reviewerId, reviewNote: note || null, reviewedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    const req = await tx.manualPaymentRequest.findUniqueOrThrow({ where: { id: requestId } });
    const subscription = await tx.clubSubscription.findUniqueOrThrow({ where: { clubId: req.clubId } });

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await tx.saasPayment.create({
      data: {
        clubId: req.clubId,
        subscriptionId: subscription.id,
        amount: req.amount,
        currency: req.currency,
        status: "PAID",
        paymentProvider: "MANUAL",
        providerRef: `manual:${req.id}`,
        paidAt: now,
      },
    });
    await tx.clubSubscription.update({
      where: { id: subscription.id },
      data: { planId: req.planId, status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: null },
    });
    await tx.club.updateMany({
      where: { id: req.clubId, status: { in: ["TRIAL", "SUSPENDED"] } },
      data: { status: "ACTIVE", trialEndsAt: null, suspendedAt: null, suspendedReason: null },
    });
    return true;
  });
}
