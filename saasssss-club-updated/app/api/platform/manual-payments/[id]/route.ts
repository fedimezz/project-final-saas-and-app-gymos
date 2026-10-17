// PATCH /api/platform/manual-payments/[id] { action: "confirm"|"reject", note? } — SUPER_ADMIN only.
// "confirm" = the money was received: activates the club's subscription for one month.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { formatZodError } from "@/lib/validation";
import { confirmManualPaymentRequest } from "@/lib/manual-payment";

const schema = z.object({ action: z.enum(["confirm", "reject"]), note: z.string().trim().max(500).optional() });
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès réservé à la plateforme" }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { action, note } = parsed.data;

    const existing = await prisma.manualPaymentRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    let done: boolean;
    if (action === "confirm") {
      done = await confirmManualPaymentRequest(id, auth.user.id, note);
    } else {
      const res = await prisma.manualPaymentRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "REJECTED", reviewedBy: auth.user.id, reviewNote: note || null, reviewedAt: new Date() },
      });
      done = res.count === 1;
    }
    if (!done) return NextResponse.json({ error: "Cette demande a déjà été traitée." }, { status: 409 });

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: action === "confirm" ? "MANUAL_PAYMENT_CONFIRMED" : "MANUAL_PAYMENT_REJECTED",
      category: "PAYMENT",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Platform manual-payments PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
