import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getSessionDateTime } from "@/lib/session-date";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, weeklyPlanSchema } from "@/lib/validation";

async function cleanupPastData(clubId: string) {
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: { clubId, weeklyPlan: { isArchived: false } },
    select: {
      id: true,
      day: true,
      endTime: true,
      weeklyPlan: { select: { weekStart: true } },
    },
  });

  const idsToDelete: string[] = [];

  for (const s of sessions) {
    // Use the shared UTC-based helper instead of local-time Date math —
    // weekStart is stored as a UTC calendar date, so mixing it with
    // setDate()/setHours() (local time) shifted this by a day for any
    // server timezone ahead of UTC, deleting/keeping sessions incorrectly.
    const sessionDate = getSessionDateTime(s.weeklyPlan.weekStart, s.day, s.endTime);

    if (sessionDate < now) {
      idsToDelete.push(s.id);
    }
  }

  if (idsToDelete.length > 0) {
    await prisma.session.deleteMany({ where: { id: { in: idsToDelete }, clubId } });
  }

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  await prisma.weeklyPlan.updateMany({
    where: {
      clubId,
      weekEnd: { lt: todayMidnight },
      isArchived: false,
    },
    data: { isActive: false, isArchived: true },
  });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;

    await cleanupPastData(admin.clubId as string);

    const plans = await prisma.weeklyPlan.findMany({
      where: { clubId: admin.clubId as string },
      orderBy: { weekStart: "desc" },
      include: {
        sessions: {
          orderBy: [{ day: "asc" }, { startTime: "asc" }],
          take: 500,
        },
        _count: { select: { sessions: true } },
      },
      take: 12,
    });

    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Admin schedule GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const admin = auth.user;
    if (!(await hasPermission(admin, "planning.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer le planning" }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = weeklyPlanSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { weekStart, weekEnd, isActive } = parsed.data;

    const existing = await prisma.weeklyPlan.findFirst({
      where: { clubId: admin.clubId as string, weekStart },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Un planning existe déjà pour cette semaine" },
        { status: 409 }
      );
    }

    const plan = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (isActive) {
        await tx.weeklyPlan.updateMany({
          where: { clubId: admin.clubId as string, isActive: true },
          data: { isActive: false },
        });
      }

      return tx.weeklyPlan.create({
        data: {
          clubId: admin.clubId as string,
          weekStart,
          weekEnd,
          isActive: !!isActive,
        },
        include: { _count: { select: { sessions: true } } },
      });
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("Admin schedule POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}