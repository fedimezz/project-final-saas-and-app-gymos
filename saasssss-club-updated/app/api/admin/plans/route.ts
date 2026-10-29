import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { formatZodError, planSchema } from "@/lib/validation";
import { isValidMembershipPrice } from "@/lib/payment-currencies";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

// NOTE: swap this for your existing `requireAdmin` helper if you already
// have one — this inline check just guards against non-admin users using
// the same `requireUser` session helper the rest of the app uses.
async function requireAdmin(request: NextRequest) {
  const auth = await requireUser(request);
  if (isAuthResponse(auth)) return auth;
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  return auth;
}

// GET /api/admin/plans — list all plans (active + inactive) for THIS gym
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthResponse(auth)) return auth;

  try {
    const plans = await prisma.membershipPlan.findMany({ where: { clubId: auth.clubId as string }, orderBy: { price: "asc" }, take: 200 });
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Admin plans GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/plans — create a plan
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (isAuthResponse(auth)) return auth;
  const denied = await denyUnlessPermitted(auth, "memberships.sell");
  if (denied) return denied;

  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = planSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, description, price, currency, durationDays, features } = parsed.data;
    if (!isValidMembershipPrice(price, currency)) {
      return NextResponse.json({ error: `Le prix doit respecter la précision autorisée pour ${currency}.` }, { status: 400 });
    }

    const plan = await prisma.membershipPlan.create({
      data: {
        clubId: auth.clubId as string,
        name,
        description: description || null,
        price,
        currency,
        durationDays,
        features: features ?? [],
      },
    });

    runAfter(() =>
      logAction(request, {
        clubId: auth.clubId as string,
        actorId: auth.id, actorName: auth.name, actorRole: auth.role,
        action: "PLAN_CREATED",
        category: "SUBSCRIPTION",
        targetId: plan.id,
        targetName: plan.name,
        detail: { price },
      })
    )

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("Admin plans POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
