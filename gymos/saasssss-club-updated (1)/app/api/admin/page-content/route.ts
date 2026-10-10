import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { denyUnlessPermitted } from "@/lib/permission-guard";
import { PAGE_CONTENT_SCHEMA, MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";
import { formatZodError, pageContentEnvelopeSchema } from "@/lib/validation";
import { denyIfWebsiteLocked } from "@/lib/website-setup";
import { safeImageList, safeImageUrl } from "@/lib/image-url";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const rows = await prisma.pageContent.findMany({ where: { clubId: auth.user.clubId as string, pageKey: { in: PAGE_CONTENT_SCHEMA.map((p) => p.pageKey) } } });
    const savedByPage = new Map(rows.map((r: { pageKey: string; content: unknown }) => [r.pageKey, r.content as Record<string, string>]));
    const response = NextResponse.json({ pages: PAGE_CONTENT_SCHEMA.map((def) => ({ pageKey: def.pageKey, label: def.label, fields: def.fields, previewPath: def.previewPath, content: savedByPage.get(def.pageKey) ?? {} })) });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Admin page-content GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const denied = await denyUnlessPermitted(auth.user, "content.manage");
    if (denied) return denied;
    const clubId = auth.user.clubId as string;

    // Once the guided website setup is locked, page text/photos go through
    // a WebsiteChangeRequest instead of a direct PUT — see lib/website-setup.ts.
    const lockedResponse = await denyIfWebsiteLocked(clubId);
    if (lockedResponse) return lockedResponse;

    const rawBody = await request.json().catch(() => null);
    const parsed = pageContentEnvelopeSchema.safeParse(rawBody);
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { pageKey, content } = parsed.data;
    const def = PAGE_CONTENT_SCHEMA.find((p) => p.pageKey === pageKey);
    if (!def) return NextResponse.json({ error: "Page inconnue" }, { status: 400 });

    const allowedKeys = new Set(def.fields.map((f) => f.key));
    const galleryKeys = new Set(def.fields.filter((f) => f.type === "gallery").map((f) => f.key));
    const imageKeys = new Set(def.fields.filter((f) => f.type === "image").map((f) => f.key));
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(content)) {
      if (!allowedKeys.has(key) || typeof value !== "string") continue;
      if (galleryKeys.has(key)) {
        // A gallery is a JSON array of photo URLs, capped server-side so the
        // limit can't be bypassed by calling the API directly.
        let urls: unknown;
        try { urls = JSON.parse(value || "[]"); } catch { urls = null; }
        if (!Array.isArray(urls)) continue;
        clean[key] = JSON.stringify(safeImageList(urls, MAX_GALLERY_IMAGES));
        continue;
      }
      if (imageKeys.has(key)) {
        // Single photo: only a renderable URL (or empty = "use the default").
        clean[key] = safeImageUrl(value) ?? "";
        continue;
      }
      clean[key] = value.trim();
    }

    const row = await prisma.pageContent.upsert({
      where: { clubId_pageKey: { clubId, pageKey } },
      create: { clubId, pageKey, content: clean, updatedBy: auth.user.id },
      update: { content: clean, updatedBy: auth.user.id },
    });
    const response = NextResponse.json({ pageKey: row.pageKey, content: row.content });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Admin page-content PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
