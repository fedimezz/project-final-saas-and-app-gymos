// GET  /api/admin/service-request — this club's paid-service requests.
// POST /api/admin/service-request { type, description? } — OWNER orders an
//      optional paid service (professional setup, personalisation, premium).
//      Price is read from service_prices and snapshotted; refused if SUPER_ADMIN
//      has not configured an active price. CUSTOM_DOMAIN goes through
//      /api/admin/domain-request instead.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError, serviceRequestCreateSchema } from "@/lib/validation";
import { getActiveServicePrice, PriceNotConfiguredError } from "@/lib/service-pricing";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";
import type { ServiceType } from "@/lib/service-catalog";

const DENIED = "Accès réservé au propriétaire";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const clubId = auth.user.clubId as string;
    // Owners see the catalogue with the CURRENT active price so the UI never
    // hardcodes amounts; each request keeps its own snapshotted price.
    const [requests, prices] = await Promise.all([
      prisma.serviceRequest.findMany({ where: { clubId }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.servicePrice.findMany({
        where: { isActive: true },
        select: { serviceType: true, price: true, currency: true },
      }),
    ]);
    return NextResponse.json({ requests, prices });
  } catch (error) {
    console.error("Owner service-request GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });
    const clubId = auth.user.clubId as string;

    const rl = await checkRateLimit(`service-request:${clubId}`, 10, 24 * 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de demandes aujourd'hui. Réessayez demain." }, { status: 429 });
    }

    const parsed = serviceRequestCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const type = parsed.data.type as ServiceType;

    // Don't stack duplicates of the same service while one is still open.
    const open = await prisma.serviceRequest.findFirst({
      where: { clubId, type: type as never, status: { in: ["PENDING", "APPROVED", "IN_PROGRESS"] } },
      select: { id: true },
    });
    if (open) {
      return NextResponse.json({ error: "Une demande identique est déjà en cours." }, { status: 409 });
    }

    let snapshot: { price: number; currency: string };
    try {
      snapshot = await getActiveServicePrice(type);
    } catch (e) {
      if (e instanceof PriceNotConfiguredError) {
        return NextResponse.json(
          { error: "Ce service n'est pas disponible pour le moment. Contactez le support." },
          { status: 503 }
        );
      }
      throw e;
    }

    const created = await prisma.serviceRequest.create({
      data: {
        clubId,
        requestedBy: auth.user.id,
        type: type as never,
        description: parsed.data.description || null,
        priceAtRequest: snapshot.price,
        currency: snapshot.currency,
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId, actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "SERVICE_REQUESTED", category: "SETTINGS", targetId: created.id, targetName: type,
      })
    );
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error("Owner service-request POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
