// GET /api/admin/members/search?q=... — lightweight member lookup for
// pickers (e.g. the "Membre(s) spécifique(s)" notification recipient
// picker). Returns a small shape (id, name, email, phone, avatar,
// isActive) instead of the full paginated /api/admin/members payload.
//
// NOTE: this route was missing entirely, which is why searching for a
// specific member in the admin notifications composer silently failed
// (404 → the picker's catch block just showed "Aucun membre trouvé").
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const RESULT_LIMIT = 15;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();

    const users = await prisma.user.findMany({
      where: {
        clubId: auth.user.clubId,
        role: "MEMBER",
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
      take: RESULT_LIMIT,
    });

    return NextResponse.json({ members: users });
  } catch (error) {
    console.error("Admin members search GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
