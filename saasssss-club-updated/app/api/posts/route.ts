import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { notifyAllMembers } from "@/lib/notify";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, postSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const tenant = await resolveTenantFromRequest(request);
  if (!tenant) {
    const response = NextResponse.json([]);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }

  const posts = await prisma.post.findMany({
    where: { clubId: tenant.id, isPublished: true },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      likes: { select: { userId: true }, take: 500 },
      comments: {
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const response = NextResponse.json(posts);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const admin = auth.user;

  if (!(await hasPermission(admin, "announcements.manage"))) {
    return NextResponse.json({ error: "Permission requise : gérer les annonces" }, { status: 403 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { title, content, mediaUrl, mediaType, musicUrl } = parsed.data;

  const post = await prisma.post.create({
    data: {
      clubId: admin.clubId as string,
      authorId: admin.id,
      title: title || null,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      musicUrl: musicUrl || null,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      likes: true,
      comments: true,
    },
  });

  // 🔔 Notify all members instantly via SSE + persist in DB bell
  await notifyAllMembers(admin.clubId!, {
    title: "📰 Nouvelle actualité",
    message: title
      ? `"${title}" — ${content.slice(0, 80)}${content.length > 80 ? "…" : ""}`
      : content.slice(0, 100) + (content.length > 100 ? "…" : ""),
    type: "NEWS",
    data: { postId: post.id },
  });

  return NextResponse.json(post, { status: 201 });
}