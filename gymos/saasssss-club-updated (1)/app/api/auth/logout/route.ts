import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { clearAuthCookie } from "@/lib/auth-cookie";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth.ok) {
    await logAction(request, {
      clubId: auth.user.clubId,
      actorId: auth.user.id,
      actorName: auth.user.name,
      actorRole: auth.user.role,
      action: "USER_LOGOUT",
      category: "AUTH",
    });
  }

  const response = NextResponse.json({ message: "Déconnexion réussie" });
  // Must expire the cookie with the same Domain/Path it was set with (and the
  // host-only variant) — a bare delete() leaves the Domain=.host cookie alive
  // in production, i.e. "logout" didn't log anybody out.
  clearAuthCookie(response, request.url);
  return response;
}
