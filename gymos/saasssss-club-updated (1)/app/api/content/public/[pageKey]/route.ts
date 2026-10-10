import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PAGE_CONTENT_SCHEMA } from "@/lib/page-content-schema";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { safeImageList, safeImageUrl } from "@/lib/image-url";
import { MAX_GALLERY_IMAGES } from "@/lib/page-content-schema";

export async function GET(request: NextRequest, { params }: { params: Promise<{ pageKey: string }> }) {
  const { pageKey } = await params;
  if (!PAGE_CONTENT_SCHEMA.some((p) => p.pageKey === pageKey)) {
    const response = NextResponse.json({ content: {} });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  }
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) {
      return NextResponse.json({ content: {} }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    const row = await prisma.pageContent.findUnique({
      where: { clubId_pageKey: { clubId: tenant.id, pageKey } },
    });
    // Legacy rows may hold URLs the renderer can't show (wrong host, http:,
    // javascript:) — drop them here so a bad stored value can never crash a page.
    const content: Record<string, string> = { ...((row?.content as Record<string, string>) ?? {}) };
    const def = PAGE_CONTENT_SCHEMA.find((p) => p.pageKey === pageKey);
    for (const f of def?.fields ?? []) {
      const v = content[f.key];
      if (typeof v !== "string") continue;
      if (f.type === "image") content[f.key] = safeImageUrl(v) ?? "";
      if (f.type === "gallery") {
        try { content[f.key] = JSON.stringify(safeImageList(JSON.parse(v || "[]"), MAX_GALLERY_IMAGES)); }
        catch { content[f.key] = "[]"; }
      }
    }
    const response = NextResponse.json({ content });
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    console.error("Public page-content GET error:", error);
    return NextResponse.json({ content: {} }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
}
