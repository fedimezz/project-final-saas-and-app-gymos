// GET /api/auth/callback/google
// Finishes the Google OAuth flow: exchanges the authorization code for
// tokens, fetches the Google profile and finds-or-creates the matching User.
//
// This route runs on the APEX host (Google's single registered redirect_uri),
// so it CANNOT set the session cookie for the club: a response from
// localhost / yoursaas.com can't set a cookie for club-a.localhost /
// club-a.yoursaas.com. Instead it redirects the browser to
// {club}/api/auth/bridge with a short-lived one-time token, and the bridge
// (running ON the club host) sets the session cookie there.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateBridgeToken } from "@/lib/auth";
import { verifyGoogleState } from "@/lib/oauth-state";
import { resolveClubById, isClubUsable } from "@/lib/tenant";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { fetchWithTimeout } from "@/lib/http";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function GET(request: NextRequest) {
  // Only used for the token exchange (must byte-for-byte match what the
  // initiation route sent Google) and as the fallback for errors that
  // happen before we know which club this is — we genuinely don't have a
  // tenant to send the browser back to yet.
  const apexUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(request.url).origin;
  const apexLoginUrl = (error: string) => `${apexUrl}/user/login?error=${encodeURIComponent(error)}`;

  // Kept as a no-op wrapper: the state is now signed (lib/oauth-state.ts), so
  // there is no state cookie to clear any more.
  const clearStateCookie = (response: NextResponse) => response;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_not_configured")));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // `state` is HMAC-signed by /api/auth/google: a forged or expired one fails
  // here, so the club id / nonce hash inside it can be trusted.
  const verifiedState = verifyGoogleState(state);

  if (oauthError) {
    // User declined on Google's consent screen — not an app error. If the
    // signed state is valid, send them back to THEIR club's login page.
    const declinedClub = verifiedState ? await resolveClubById(verifiedState.clubId) : null;
    const declinedUrl = isClubUsable(declinedClub)
      ? `${buildTenantOrigin(declinedClub, new URL(request.url).origin)}/user/login?error=google_denied`
      : apexLoginUrl("google_denied");
    return clearStateCookie(NextResponse.redirect(declinedUrl));
  }

  if (!code || !verifiedState) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_state_mismatch")));
  }

  const tenant = await resolveClubById(verifiedState.clubId);
  if (!isClubUsable(tenant)) {
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("club_unavailable")));
  }
  // The CLUB's own origin (custom domain, {slug}.apex, or {slug}.localhost in
  // dev) — never the apex this request landed on.
  const baseUrl = buildTenantOrigin(tenant, new URL(request.url).origin);
  const loginUrl = (error: string) => `${baseUrl}/user/login?error=${encodeURIComponent(error)}`;

  try {
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ?? `${apexUrl}/api/auth/callback/google`;

    const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData: GoogleTokenResponse = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Google token exchange failed:", tokenData.error, tokenData.error_description);
      return clearStateCookie(NextResponse.redirect(loginUrl("google_token_failed")));
    }

    const userInfoRes = await fetchWithTimeout("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      return clearStateCookie(NextResponse.redirect(loginUrl("google_userinfo_failed")));
    }

    const profile: GoogleUserInfo = await userInfoRes.json();

    if (!profile.email || !profile.email_verified) {
      // Don't trust an email Google itself hasn't verified.
      return clearStateCookie(NextResponse.redirect(loginUrl("google_email_unverified")));
    }

    const normalizedEmail = profile.email.trim().toLowerCase();

    let user = await prisma.user.findFirst({ where: { clubId: tenant.id, email: normalizedEmail } });
    let isNewUser = false;

    if (user) {
      if (!user.isActive) {
        return clearStateCookie(NextResponse.redirect(loginUrl("account_disabled")));
      }
      // Link the Google identity to an existing (e.g. password-created)
      // account on first Google sign-in. Google already verified this
      // email address, so we can safely mark it verified too — this also
      // lets someone who signed up with a password but never finished
      // our own email-code step get unblocked via Google instead.
      if (!user.googleId || !user.emailVerified) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId ?? profile.sub,
            emailVerified: user.emailVerified ?? new Date(),
            avatar: user.avatar ?? profile.picture ?? null,
          },
        });
      }
    } else {
      isNewUser = true;
      try {
        user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const createdUser = await tx.user.create({
            data: {
              clubId: tenant.id,
              name: profile.name?.trim() || normalizedEmail.split("@")[0],
              email: normalizedEmail,
              password: null,
              googleId: profile.sub,
              avatar: profile.picture ?? null,
              role: "MEMBER",
              isActive: true,
              // Google already confirmed this address — skip our own
              // 6-digit code for accounts created this way.
              emailVerified: new Date(),
            },
          });

          const cardNumber = `LCG${Date.now()}${Math.floor(Math.random() * 1000)}`;
          const expiresAt = new Date();
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);

          await tx.membershipCard.create({
            data: {
              clubId: tenant.id,
              userId: createdUser.id,
              cardNumber,
              qrCode: `QR-${cardNumber}`,
              expiresAt,
            },
          });

          return createdUser;
        });
      } catch (err: unknown) {
        // googleId is unique platform-wide (one Google identity = one
        // login identity), so signing up at a second gym with the same
        // Google account hits that constraint — a known trade-off, see
        // the comment on User.googleId in schema.prisma.
        if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
          return clearStateCookie(NextResponse.redirect(loginUrl("google_account_linked_elsewhere")));
        }
        throw err;
      }
    }

    const destination = isNewUser
        ? "/user/onboarding"
        : ["ADMIN", "OWNER"].includes(user.role.toUpperCase())
            ? "/admin"
            : "/dashboard";

    // One-time bridge token, redeemed on the CLUB host (see header). The
    // nonce hash comes from the signed state, so only the browser that
    // started the flow (it holds the raw nonce in a host-only cookie on the
    // club host) can finish it.
    const bridgeToken = generateBridgeToken({
      id: user.id,
      clubId: tenant.id,
      nonceHash: verifiedState.nonceHash,
      via: "google",
    });
    const syncPath = `/auth/sync?next=${encodeURIComponent(destination)}`;
    const bridgeUrl =
      `${baseUrl}/api/auth/bridge?token=${encodeURIComponent(bridgeToken)}` +
      `&redirect=${encodeURIComponent(syncPath)}`;

    const response = NextResponse.redirect(bridgeUrl);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return clearStateCookie(NextResponse.redirect(apexLoginUrl("google_error")));
  }
}