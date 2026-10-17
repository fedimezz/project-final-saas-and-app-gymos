// PATCH /api/platform/domain-requests/[id] { status?, reviewNote?, dnsInstructions? }
// SUPER_ADMIN only. Workflow: PENDING → APPROVED/REJECTED → CONFIGURING → ACTIVE.
// Moving to ACTIVE asserts the staff member has ALREADY added the domain to the
// hosting provider and DNS/SSL works — nothing here configures infrastructure.
// ACTIVE is what switches the club's `customDomain` on (tenant routing reads it);
// leaving ACTIVE switches it off again, atomically with the status change.
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { canTransition, DOMAIN_TRANSITIONS, type DomainStatus } from "@/lib/domain-requests";
import { domainRequestReviewSchema, formatZodError } from "@/lib/validation";

const DENIED = "Accès réservé à la plateforme";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const csrf = verifyOrigin(request);
    if (csrf) return csrf;

    const { id } = await params;
    const parsed = domainRequestReviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { status, reviewNote, dnsInstructions } = parsed.data;

    const existing = await prisma.domainRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

    const from = existing.status as DomainStatus;
    if (status && status !== from && !canTransition(DOMAIN_TRANSITIONS, from, status)) {
      return NextResponse.json(
        { error: `Transition impossible : ${from} → ${status}` },
        { status: 409 }
      );
    }

    const data: Prisma.DomainRequestUpdateInput = { reviewedBy: auth.user.id, reviewedAt: new Date() };
    if (status) data.status = status;
    if (reviewNote !== undefined) data.reviewNote = reviewNote || null;
    if (dnsInstructions !== undefined) {
      data.dnsInstructions = dnsInstructions === null ? Prisma.JsonNull : { text: dnsInstructions };
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const next = await tx.domainRequest.update({ where: { id }, data });
        if (status === "ACTIVE") {
          await tx.club.update({ where: { id: existing.clubId }, data: { customDomain: existing.domain } });
        } else if (status && from === "ACTIVE") {
          await tx.club.updateMany({
            where: { id: existing.clubId, customDomain: existing.domain },
            data: { customDomain: null },
          });
        }
        return next;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: "Ce domaine est déjà utilisé par un autre club." }, { status: 409 });
      }
      throw e;
    }

    await logAction(request, {
      clubId: existing.clubId,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: "SUPER_ADMIN",
      action: `DOMAIN_REQUEST_${status ?? "NOTE"}`,
      category: "SETTINGS", targetId: existing.id, targetName: existing.domain,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Platform domain request patch error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
