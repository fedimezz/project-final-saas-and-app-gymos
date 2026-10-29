// PATCH /api/platform/manual-payments/[id] — SUPER_ADMIN only. Three explicit actions:
//   { action: "approve", note? }                       PENDING  → APPROVED   (activates NOTHING)
//   { action: "reject",  note? }                       PENDING / APPROVED → REJECTED
//   { action: "activate", paymentReference, note? }    APPROVED → CONFIRMED  (verified payment / agreed terms:
//                                                      activates the subscription for the requested period)
// "activate" is refused for a request that is not APPROVED, and without a payment/agreement reference.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { formatZodError } from "@/lib/validation";
import { invalidateClubCache } from "@/lib/tenant";
import {
  activateManualPaymentRequest,
  approveManualPaymentRequest,
  rejectManualPaymentRequest,
} from "@/lib/manual-payment";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().trim().max(500).optional() }),
  z.object({
    action: z.literal("activate"),
    paymentReference: z.string().trim().min(3, "Indiquez la référence du paiement ou de l'accord.").max(200),
    note: z.string().trim().max(500).optional(),
  }),
]);
type Ctx = { params: Promise<{ id: string }> };

const AUDIT = { approve: "MANUAL_PAYMENT_APPROVED", reject: "MANUAL_PAYMENT_REJECTED", activate: "MANUAL_PAYMENT_CONFIRMED" } as const;

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const input = parsed.data;

    const existing = await prisma.manualPaymentRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    let done = false;
    if (input.action === "approve") {
      done = await approveManualPaymentRequest(id, auth.user.id, input.note);
    } else if (input.action === "reject") {
      done = await rejectManualPaymentRequest(id, auth.user.id, input.note);
    } else {
      const result = await activateManualPaymentRequest(id, auth.user.id, { paymentReference: input.paymentReference, note: input.note });
      if (!result.ok && result.reason === "CLUB_CANCELLED") {
        return NextResponse.json({ error: "Ce club a été résilié par la plateforme : il ne peut pas être réactivé par un paiement." }, { status: 409 });
      }
      done = result.ok;
      if (done) {
        const club = await prisma.club.findUnique({ where: { id: existing.clubId }, select: { slug: true } });
        if (club) invalidateClubCache(club.slug);
      }
    }
    if (!done) {
      return NextResponse.json(
        { error: input.action === "activate" ? "Seule une demande approuvée peut être activée (déjà activée, refusée ou non approuvée)." : "Cette demande a déjà été traitée." },
        { status: 409 }
      );
    }

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: AUDIT[input.action],
      category: "PAYMENT",
      targetId: id,
      detail: { billingPeriod: existing.billingPeriod, planId: existing.planId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Platform manual-payments PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
