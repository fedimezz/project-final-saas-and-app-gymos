// GET /api/auth/google
// Starts the Google OAuth "Authorization Code" flow from a CLUB's own login
// page (e.g. club-a.host/user/login). Google's registered redirect_uri is a
// single fixed URL on the platform apex — Google doesn't support per-subdomain
// callbacks — so the club has to survive the trip through Google and back.
//
// How (works on localhost AND in production):
//   • `state` is a signed blob (lib/oauth-state.ts) carrying the club id and
//     the hash of a random nonce — no cookie has to cross from the club host
//     to the apex (browsers won't share club-a.localhost <-> localhost).
//   • The raw nonce is stored in a HOST-ONLY cookie on the club host. At the end
//     of the flow the apex callback redirects to {club}/api/auth/bridge, which
//     checks that cookie: only the browser that started the flow can finish it.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hashBridgeNonce } from "@/lib/auth";
import { buildAuthCookieOptions } from "@/lib/auth-cookie";
import { BRIDGE_NONCE_COOKIE } from "@/lib/bridge-nonce";
import { createGoogleState } from "@/lib/oauth-state";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "La connexion Google n'est pas configurée." },
      { status: 501 }
    );
  }

  const tenant = await resolveTenantFromRequest(request);
  if (!isClubUsable(tenant)) {
    return NextResponse.json({ error: "Ce club n'est plus disponible." }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? `${baseUrl}/api/auth/callback/google`;

  const nonce = crypto.randomBytes(24).toString("hex");
  const state = createGoogleState({ clubId: tenant.id, nonceHash: hashBridgeNonce(nonce) });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl.toString());
  // Host-only on purpose (no Domain attribute): it must be sent back to THIS
  // club host when the bridge redirect lands here, and to nobody else.
  response.cookies.set(BRIDGE_NONCE_COOKIE, nonce, {
    ...buildAuthCookieOptions(request.url, { hostOnly: true }),
    maxAge: 60 * 10,
  });
  return response;
}
