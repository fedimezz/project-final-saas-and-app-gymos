import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser, isAuthResponse } from "@/lib/auth-server";
import { logAction } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { commentDeleteSchema, commentSchema, formatZodError } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { runAfter } from "@/lib/after";

// POST /api/posts/[id]/comments  { content } — any logged-in user can comment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.id;

    // Anti-spam: 20 comments per 10 minutes per user.
    const rl = await checkRateLimit(`post-comment:${userId}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de commentaires en peu de temps. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

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

    // The journal must never turn a saved comment into a 500 (the user would
    // retry and post it twice), so it runs after the response.
    runAfter(() =>
      logAction(request, {
        clubId: auth.clubId,
        actorId: auth.id,
        actorName: auth.name,
        actorRole: auth.role,
        action: "POST_COMMENTED",
        category: "CONTENT",
        targetId: post.id,
        targetName: post.title ?? "Actualité",
        detail: { commentId: comment.id },
      })
    );

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Post comments POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/posts/[id]/comments  { commentId } — the comment's own author can
// delete it; otherwise it is admin moderation (needs announcements.manage).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser(request);
    if (isAuthResponse(auth)) return auth;

    const { id: postId } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = commentDeleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { commentId } = parsed.data;

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, post: { id: postId, clubId: auth.clubId as string } },
    });
    if (!comment) {
      return NextResponse.json({ error: "Commentaire introuvable" }, { status: 404 });
    }

    if (comment.userId !== auth.id) {
      const isStaff = auth.role === "ADMIN" || auth.role === "OWNER";
      if (!isStaff || !(await hasPermission(auth, "announcements.manage"))) {
        return NextResponse.json({ error: "Vous ne pouvez supprimer que vos propres commentaires" }, { status: 403 });
      }
    }

    await prisma.comment.delete({ where: { id: commentId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post comments DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
