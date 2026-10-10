import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, postUpdateSchema } from "@/lib/validation";

// PATCH /api/posts/[id] — edit a post's content, or toggle isPublished.
// Admin news page uses this both for full edits and the publish/unpublish
// toggle, so every field is optional and only what's provided gets updated.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "announcements.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer les annonces" }, { status: 403 });
    }

    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = postUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { title, content, mediaUrl, mediaType, musicUrl, isPublished } = parsed.data;

    const existing = await prisma.post.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
    }

    const post = await prisma.post.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title || null } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(mediaUrl !== undefined ? { mediaUrl: mediaUrl || null } : {}),
        ...(mediaType !== undefined ? { mediaType: mediaType || null } : {}),
        ...(musicUrl !== undefined ? { musicUrl: musicUrl || null } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        likes: { select: { userId: true } },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(post);
  } catch (error) {
    console.error("Post PATCH error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/posts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    if (!(await hasPermission(auth.user, "announcements.manage"))) {
      return NextResponse.json({ error: "Permission requise : gérer les annonces" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.post.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
    }

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
