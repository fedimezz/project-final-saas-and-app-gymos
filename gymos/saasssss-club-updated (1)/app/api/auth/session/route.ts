import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getTokenFromRequest, verifyToken } from "@/lib/auth";

/**
 * Re-hydrates client auth from the httpOnly cookie. Intentionally does NOT
 * call verifyTenant() — a valid token + active user is enough to populate
 * the UI mirror in localStorage (e.g. right after /api/auth/bridge on a new
 * subdomain origin).
 */
export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const payload = verifyToken(token);
  if (!payload?.id) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      clubId: true,
      isActive: true,
      passwordChangedAt: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  // Same revocation rule as lib/auth.ts: a session issued before the last
  // password change is dead, so the client never mirrors a revoked login.
  if (
    dbUser.passwordChangedAt &&
    typeof payload.iat === "number" &&
    payload.iat < Math.floor(dbUser.passwordChangedAt.getTime() / 1000)
  ) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      avatar: dbUser.avatar,
      clubId: dbUser.clubId,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
