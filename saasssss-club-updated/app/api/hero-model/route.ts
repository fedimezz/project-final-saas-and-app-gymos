// GET /api/hero-model — the club's custom 3D model file, PUBLIC (it is shown on
// the public homepage) but strictly tenant-scoped: the club is resolved from the
// request HOST by resolveTenantFromRequest(), never from a query parameter or
// header the client could forge. A club with no custom model gets a 404.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest } from "@/lib/tenant";

const NOT_FOUND = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  try {
    const tenant = await resolveTenantFromRequest(request);
    if (!tenant) return NOT_FOUND();

    // Cheap check first: hash only, so a revalidation (If-None-Match) never loads the file.
    const head = await prisma.clubHeroModel.findUnique({
      where: { clubId: tenant.id },
      select: { sha256: true, contentType: true, format: true },
    });
    if (!head) return NOT_FOUND();

    const etag = `"${head.sha256}"`;
    const requestedVersion = request.nextUrl.searchParams.get("v");
    // The versioned URL is content-addressed → safe to cache for a year. Without
    // (or with a stale) version the browser must revalidate.
    const immutable = requestedVersion !== null && requestedVersion === head.sha256.slice(0, 16);
    const baseHeaders: Record<string, string> = {
      ETag: etag,
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      // The file is data: if it were ever opened as a document it can run nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      Vary: "Host",
    };

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: baseHeaders });
    }

    const row = await prisma.clubHeroModel.findUnique({ where: { clubId: tenant.id }, select: { data: true } });
    if (!row) return NOT_FOUND();
    const bytes = new Uint8Array(row.data);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": head.contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="hero-model.${head.format === "gltf" ? "gltf" : "glb"}"`,
      },
    });
  } catch (error) {
    console.error("Hero model GET error:", error);
    return new NextResponse(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
