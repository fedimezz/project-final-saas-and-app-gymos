// GET  /api/admin/domain-request — this club's custom-domain requests.
// POST /api/admin/domain-request { domain } — OWNER asks for a personalised
//      domain (paid optional service). The price is read from service_prices
//      and snapshotted onto the request; nothing is configured automatically —
//      a SUPER_ADMIN reviews it and drives it PENDING → APPROVED → CONFIGURING
//      → ACTIVE (see /platform/service-requests).
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { domainRequestCreateSchema, formatZodError } from "@/lib/validation";
import { getActiveServicePrice, PriceNotConfiguredError } from "@/lib/service-pricing";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const DENIED = "Accès réservé au propriétaire";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const requests = await prisma.domainRequest.findMany({
      where: { clubId: auth.user.clubId as string },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Owner domain-request GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const rl = await checkRateLimit(`domain-request:${clubId}`, 5, 24 * 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de demandes aujourd'hui. Réessayez demain." }, { status: 429 });
    }

    const parsed = domainRequestCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { domain } = parsed.data;

    // One live custom-domain request per club (a club serves one custom domain).
    const open = await prisma.domainRequest.findFirst({
      where: { clubId, status: { not: "REJECTED" } },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json(
        { error: "Une demande de domaine est déjà en cours pour votre club." },
        { status: 409 }
      );
    }

    let snapshot: { price: number; currency: string };
    try {
      snapshot = await getActiveServicePrice("CUSTOM_DOMAIN");
    } catch (e) {
      if (e instanceof PriceNotConfiguredError) {
        return NextResponse.json(
          { error: "Ce service n'est pas disponible pour le moment. Contactez le support." },
          { status: 503 }
        );
      }
      throw e;
    }

    let created;
    try {
      created = await prisma.domainRequest.create({
        data: { clubId, requestedBy: auth.user.id, domain, priceAtRequest: snapshot.price, currency: snapshot.currency },
      });
    } catch (e) {
      // domain is globally unique (another club, or this club's earlier REJECTED row).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const mine = await prisma.domainRequest.findUnique({ where: { domain }, select: { clubId: true, status: true, id: true } });
        if (mine && mine.clubId === clubId && mine.status === "REJECTED") {
          // Same club re-submitting a previously rejected domain: reopen it at
          // today's price (the rejected request was never fulfilled/billed).
          created = await prisma.domainRequest.update({
            where: { id: mine.id },
            data: {
              status: "PENDING", requestedBy: auth.user.id,
              priceAtRequest: snapshot.price, currency: snapshot.currency,
              reviewedBy: null, reviewNote: null, reviewedAt: null, dnsInstructions: Prisma.JsonNull,
            },
          });
        } else {
          return NextResponse.json({ error: "Ce domaine est déjà demandé." }, { status: 409 });
        }
      } else {
        throw e;
      }
    }

    runAfter(() =>
      logAction(request, {
        clubId, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "DOMAIN_REQUESTED", category: "SETTINGS", targetId: created.id, targetName: domain,
      })
    );
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("Owner domain-request POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
