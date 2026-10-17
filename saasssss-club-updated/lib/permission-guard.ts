// lib/permission-guard.ts
//
// One-liner for admin routes: after requireAdmin(), call
//
//   const denied = await denyUnlessPermitted(auth.user, "bookings.manage");
//   if (denied) return denied;
//
// OWNER always passes; an ADMIN passes when the owner hasn't revoked the
// permission (or, for opt-in permissions, has granted it) — see lib/permissions.ts.
import { NextResponse } from "next/server";
import type { JWTPayload } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";

export async function denyUnlessPermitted(
  user: JWTPayload,
  keyOrKeys: string | string[]
): Promise<NextResponse | null> {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  if (await hasAnyPermission(user, keys)) return null;
  return NextResponse.json({ error: "Permission insuffisante" }, { status: 403 });
}
