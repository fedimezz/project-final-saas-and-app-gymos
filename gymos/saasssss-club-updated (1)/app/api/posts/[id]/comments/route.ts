import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { requireAdmin } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { commentDeleteSchema, commentSchema, formatZodError } from "@/lib/validation";

// POST /api/posts/[id]/comments  { content } — any logged-in user can comment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.id;

    const { id: postId } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = commentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { content } = parsed.data;

    const post = await prisma.post.findFirst({ where: { id: postId, clubId: auth.clubId as string } });
    if (!post) {
      return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: { userId, postId, content },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    await logAction(request, {
      clubId: auth.clubId,
      actorId: auth.id,
      actorName: auth.name,
      actorRole: auth.role,
      action: "POST_COMMENTED",
      category: "CONTENT",
      targetId: post.id,
      targetName: post.title ?? "Actualité",
      detail: { commentId: comment.id },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Post comments POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/posts/[id]/comments  { commentId } — admin moderation only.
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

    const { id: postId } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = commentDeleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { commentId } = parsed.data;

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, post: { id: postId, clubId: auth.user.clubId as string } },
    });
    if (!comment) {
      return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post comments DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
