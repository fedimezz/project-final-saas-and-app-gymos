
import { NextRequest, NextResponse } from "next/server";
import { Prisma, ClubStatus, SaasPlanTier } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/bcrypt";
import { verifyOrigin } from "@/lib/csrf";
import { logAction } from "@/lib/activity-log";
import { formatZodError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { createClubSchema, parseSort, provisionClub, isUniqueViolation, DEFAULT_TRIAL_DAYS } from "@/lib/platform-clubs";

const DENIED = "Accès réservé à la plateforme";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const plan = searchParams.get("plan");
    const search = (searchParams.get("search") ?? "").trim().slice(0, 100);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));
    const sort = parseSort(searchParams.get("sort"), searchParams.get("order"));

    const validStatus = status && (Object.values(ClubStatus) as string[]).includes(status);
    const validPlan = plan && (Object.values(SaasPlanTier) as string[]).includes(plan);

    const where: Prisma.ClubWhereInput = {
      ...(validStatus ? { status: status as ClubStatus } : {}),
      ...(validPlan ? { subscription: { is: { plan: { is: { tier: plan as SaasPlanTier } } } } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
              { customDomain: { contains: search, mode: "insensitive" } },
              { users: { some: { role: "OWNER", email: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [clubs, total, byStatus] = await Promise.all([
      prisma.club.findMany({
        where,
        select: {
          id: true, name: true, slug: true, status: true, customDomain: true,
          trialEndsAt: true, suspendedAt: true, suspendedReason: true, createdAt: true,
          subscription: {
            select: {
              status: true,
              plan: { select: { id: true, tier: true, name: true, priceMonthly: true, currency: true } },
            },
          },
          users: {
            where: { role: "OWNER" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true, name: true, email: true },
          },
          _count: { select: { users: true } },
        },
        orderBy: { [sort.field]: sort.order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.club.count({ where }),
      prisma.club.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const statusCounts: Record<string, number> = { TRIAL: 0, ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0 };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return NextResponse.json({
      clubs: clubs.map(({ users, ...club }) => ({ ...club, owner: users[0] ?? null })),
      statusCounts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    log.error("platform.clubs.list_failed", { error: String(error) });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const auth = await requireSuperAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: DENIED }, { status: auth.status });

    const parsed = createClubSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, slug, planId, ownerName, ownerEmail, ownerPhone, ownerPassword, trialDays, customDomain } = parsed.data;

    const [slugTaken, emailTaken, domainTaken, plan] = await Promise.all([
      prisma.club.findUnique({ where: { slug }, select: { id: true } }),
      prisma.user.findFirst({ where: { email: ownerEmail }, select: { id: true } }),
      customDomain ? prisma.club.findUnique({ where: { customDomain }, select: { id: true } }) : Promise.resolve(null),
      prisma.saasPlan.findFirst({ where: { id: planId, isActive: true }, select: { id: true } }),
    ]);
    if (slugTaken) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
    if (emailTaken) return NextResponse.json({ error: "Cet email est déjà associé à un compte", field: "ownerEmail" }, { status: 409 });
    if (domainTaken) return NextResponse.json({ error: "Ce domaine est déjà utilisé", field: "customDomain" }, { status: 409 });
    if (!plan) return NextResponse.json({ error: "Plan introuvable ou inactif", field: "planId" }, { status: 404 });

    const passwordHash = await hashPassword(ownerPassword);

    let created;
    try {
      created = await provisionClub({ name, slug, planId, ownerName, ownerEmail, ownerPhone, passwordHash, trialDays, customDomain });
    } catch (error) {
      // Lost a race against a concurrent create — the unique index is the real guard.
      if (isUniqueViolation(error, "slug")) return NextResponse.json({ error: "Ce slug est déjà utilisé", field: "slug" }, { status: 409 });
      if (isUniqueViolation(error, "email")) return NextResponse.json({ error: "Cet email est déjà associé à un compte", field: "ownerEmail" }, { status: 409 });
      if (isUniqueViolation(error, "customDomain")) return NextResponse.json({ error: "Ce domaine est déjà utilisé", field: "customDomain" }, { status: 409 });
      throw error;
    }
    const { club, owner } = created;

    await logAction(request, {
      clubId: club.id,
      actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
      action: "PLATFORM_CLUB_CREATED", category: "SUBSCRIPTION",
      targetId: club.id, targetName: club.name,
      detail: { slug: club.slug, planId, ownerEmail: owner.email, trialDays: trialDays ?? DEFAULT_TRIAL_DAYS },
    });

    return NextResponse.json({ ok: true, club, owner }, { status: 201 });
  } catch (error) {
    log.error("platform.clubs.create_failed", { error: String(error) });
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}