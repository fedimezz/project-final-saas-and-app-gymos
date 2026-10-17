// PUT /api/dashboard/notifications/[id]/read — alternate path some
// frontend call sites use for the same "mark one notification as read"
// action as PUT /api/dashboard/notifications/[id].
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    }
    const { id } = await params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== auth.user.id) {
      return NextResponse.json({ error: "Notification introuvable" }, { status: 404 });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
