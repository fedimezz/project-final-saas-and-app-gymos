import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withSubscriptionExpiry } from "@/lib/membership-card";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Non authentifié" : "Accès refusé" },
        { status: auth.status }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        subscriptions: {
          where: {
            status: "ACTIVE",
            endDate: { gt: new Date() },
          },
          take: 1,
          include: {
            plan: true,
          },
        },
        membershipCard: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Utilisateur non trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        ...user,
        membershipCard: withSubscriptionExpiry(user.membershipCard, user.subscriptions[0] ?? null),
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue" },
      { status: 500 }
    );
  }
}