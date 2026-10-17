// src/app/api/dashboard/notifications/clear-all/route.ts
//
// DELETE /api/dashboard/notifications/clear-all — removes every
// notification belonging to the logged-in user.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }

    const result = await prisma.notification.deleteMany({
      where: { userId: auth.user.id },
    });

    return NextResponse.json({ success: true, count: result.count });
  } catch (error) {
    console.error("Notifications clear-all error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
