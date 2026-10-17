import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { logAction } from "@/lib/activity-log";
import { clearAuthCookie } from "@/lib/auth-cookie";
import { log } from "@/lib/logger";

/**
 * Where the browser must land after logging out. Decided server-side from the
 * VERIFIED session role, never from anything the client sends (no open
 * redirect, no client-chosen tenant): platform staff go back to the platform
 * login, everybody else to the public home of the host they were on.
 */
function destinationFor(role: string | null): string {
  return role === "SUPER_ADMIN" ? "/platform/login" : "/";
}

export async function POST(request: Request) {
  let role: string | null = null;

  // The activity log is best-effort: a logging/DB hiccup must NEVER keep the
  // session cookie alive, so everything above the cookie clearing is guarded.
  try {
    const auth = await requireUser(request);
    if (auth.ok) {
      role = auth.user.role ?? null;
      await logAction(request, {
        clubId: auth.user.clubId,
        actorId: auth.user.id,
        actorName: auth.user.name,
        actorRole: auth.user.role,
        action: "USER_LOGOUT",
        category: "AUTH",
      });
    }
  } catch (err) {
    log.warn("logout_audit_failed", { reason: err instanceof Error ? err.name : "unknown" });
  }

  const response = NextResponse.json(
    { message: "Déconnexion réussie", redirectTo: destinationFor(role) },
    { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } }
  );
  // Must expire the cookie with the same Domain/Path it was set with (and the
  // host-only variant) — a bare delete() leaves the Domain=.host cookie alive
  // in production, i.e. "logout" didn't log anybody out.
  clearAuthCookie(response, request.url);
  return response;
}
