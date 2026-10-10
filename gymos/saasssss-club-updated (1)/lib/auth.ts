// src/lib/auth.ts

import { TtlCache } from "@/lib/ttl-cache";
import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { resolveTenantFromRequest, resolveClubBySlug, isClubUsable } from "@/lib/tenant";
import { AUTH_COOKIE_NAME } from "@/lib/auth-cookie";

// Cookie attributes live in lib/auth-cookie.ts (Edge-safe, shared with
// proxy.ts). Re-exported here so existing imports keep working.
export { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS, buildAuthCookieOptions } from "@/lib/auth-cookie";

export interface JWTPayload {
  id: string;
  email: string;
  role: string;
  name: string;
  // Null for SUPER_ADMIN (platform-level, not tied to any gym). Present
  // for MEMBER/ADMIN/OWNER/COACH. This is a convenience claim only — every
  // requireX() below re-verifies the REAL clubId from the database via
  // getVerifiedAccount() rather than trusting this token field, for the
  // same reason it already re-verifies role (see getVerifiedAccount below).
  clubId: string | null;
  // Added by jsonwebtoken on sign/verify. `iat` (seconds) is compared with
  // User.passwordChangedAt to revoke sessions issued before a password change.
  iat?: number;
  exp?: number;
  // Only set on single-purpose tokens (see generateBridgeToken). verifyToken()
  // refuses any token carrying it, so those can never act as a session.
  purpose?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Add JWT_SECRET to your .env file."
    );
  }
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters in production. Generate one with: openssl rand -base64 48"
    );
  }
  return secret;
}

export const generateToken = (
  payload: JWTPayload,
  expiresIn: SignOptions["expiresIn"] = "7d"
): string => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn,
  });
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    // A purpose-bound token (e.g. the onboarding bridge token) is NOT a session.
    if ((decoded as JWTPayload).purpose) return null;
    return decoded as JWTPayload;
  } catch {
    return null;
  }
};

// ── Bridge token ─────────────────────────────────────────────────────────────
// Short-lived, single-purpose token that carries identity across ONE hop
// (apex onboarding → the new club's subdomain). Differences from a session
// token, all enforced in app/api/auth/bridge/route.ts:
//   • purpose: "bridge"  → verifyToken() rejects it, so it can't be replayed
//                          against any API as a session;
//   • jti                → consumed once (lib/one-time.ts);
//   • nonce (sha256)     → bound to a cookie the same browser received from
//                          create-club, which defeats login-CSRF via a link.
export interface BridgeTokenPayload {
  id: string;
  clubId: string;
  jti: string;
  nonce: string;
  // "google" = minted by the Google OAuth callback (apex) to hand a MEMBER (or
  // staff) session to their club's own host. Those tokens always require the
  // nonce cookie, in every environment, and may be redeemed by any role.
  via?: "google";
}

export const hashBridgeNonce = (nonce: string): string =>
  crypto.createHash("sha256").update(nonce).digest("hex");

export const generateBridgeToken = (input: { id: string; clubId: string; nonceHash: string; via?: "google" }): string =>
  jwt.sign(
    {
      id: input.id,
      clubId: input.clubId,
      nonce: input.nonceHash,
      purpose: "bridge",
      jti: crypto.randomUUID(),
      ...(input.via ? { via: input.via } : {}),
    },
    getJwtSecret(),
    { expiresIn: "2m", algorithm: "HS256" }
  );

export const verifyBridgeToken = (token: string): BridgeTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    const d = decoded as Record<string, unknown>;
    if (
      d.purpose !== "bridge" ||
      typeof d.id !== "string" ||
      typeof d.clubId !== "string" ||
      typeof d.jti !== "string" ||
      typeof d.nonce !== "string"
    ) {
      return null;
    }
    return {
      id: d.id,
      clubId: d.clubId,
      jti: d.jti,
      nonce: d.nonce,
      ...(d.via === "google" ? { via: "google" as const } : {}),
    };
  } catch {
    return null;
  }
};

export const getTokenFromHeader = (request: Request): string | null => {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1] ?? null;
};

// Cookie-first (the JWT lives only in the httpOnly cookie now — the
// Authorization header fallback stays only for non-browser callers like
// the cron job, which authenticate differently anyway).
export const getTokenFromRequest = (request: Request): string | null => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (match) {
    return decodeURIComponent(match.slice(AUTH_COOKIE_NAME.length + 1));
  }
  return getTokenFromHeader(request);
};

export type AuthResult =
  | { ok: true; user: JWTPayload }
  | { ok: false; status: 401 | 403 };

function getTokenPayload(request: Request): JWTPayload | null {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

// Re-verifies the token's subject against the database. Previously every
// requireX() below trusted the JWT's `role` claim for the full life of the
// token (up to 7 days) with no DB check at all — an account suspended via
// PATCH /api/admin/members/[id] (or /api/admin/staff/[id]) kept a fully
// working session until its token happened to expire, and a role change
// (promotion/demotion) didn't take effect until re-login either.
//
// This adds one indexed primary-key lookup per authenticated request. For
// a single-club app that's the right tradeoff — proportionate, not the
// "unnecessary Redis/caching" the production brief explicitly warned
// against — but it's worth knowing about if this ever needs to scale to
// very high request volume, since it does mean auth is no longer a purely
// stateless JWT check.
// Per-request account re-check, cached for a few seconds: with a remote database it was
// one extra round trip on EVERY authenticated call. Suspension / role change / password
// change still take effect within ACCOUNT_CACHE_MS (and instantly on this instance when a
// route calls invalidateAccountCache()).
const ACCOUNT_CACHE_MS = 8_000;
const accountCache = new TtlCache<{
  id: string; email: string; role: string; name: string; isActive: boolean;
  clubId: string | null; passwordChangedAt: Date | null;
} | null>(ACCOUNT_CACHE_MS, 1000);

export function invalidateAccountCache(userId: string): void {
  accountCache.invalidate(userId);
}

/** Drops every cached account check (used by tests so cases can't leak into each other). */
export function clearAccountCache(): void {
  accountCache.clear();
}

async function getVerifiedAccount(
  payload: JWTPayload
): Promise<
  | { ok: true; account: { id: string; email: string; role: string; name: string; clubId: string | null } }
  | { ok: false; status: 401 | 403 }
> {
  const dbUser = await accountCache.get(payload.id, () =>
    prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true, email: true, role: true, name: true, isActive: true, clubId: true,
        passwordChangedAt: true,
      },
    })
  );
  if (!dbUser || !dbUser.isActive) return { ok: false, status: 403 };
  // Session revocation: a password reset/change stamps passwordChangedAt, and
  // any token issued before that instant (iat is whole seconds, so compare at
  // second resolution) is dead — a stolen session doesn't survive the victim
  // changing their password. 401, not 403: the client should go to login.
  if (
    dbUser.passwordChangedAt &&
    typeof payload.iat === "number" &&
    payload.iat < Math.floor(dbUser.passwordChangedAt.getTime() / 1000)
  ) {
    return { ok: false, status: 401 };
  }
  // Use the CURRENT role/name/email/clubId from the DB, not the possibly-stale
  // JWT claims — so a demoted/promoted account is judged correctly even
  // while holding an old token.
  return {
    ok: true,
    account: { id: dbUser.id, email: dbUser.email, role: dbUser.role, name: dbUser.name, clubId: dbUser.clubId },
  };
}

type VerifiedAccount = Extract<Awaited<ReturnType<typeof getVerifiedAccount>>, { ok: true }>["account"];

// Shared front half of every requireX(): token → payload → live DB account.
async function authenticate(
  request: Request
): Promise<{ ok: true; account: VerifiedAccount } | { ok: false; status: 401 | 403 }> {
  const payload = getTokenPayload(request);
  if (!payload) return { ok: false, status: 401 };
  return getVerifiedAccount(payload);
}

// Confirms the account's REAL clubId (from the DB, via getVerifiedAccount)
// matches the tenant resolved from the request's Host header — i.e. this
// user actually belongs to the gym whose subdomain they're hitting. This is
// the core tenant-isolation check: without it, a valid session cookie for
// Gym A would work against Gym B's subdomain (e.g. if a cookie's domain
// was ever misconfigured, or an API was called directly rather than
// through the browser). NEVER trust a clubId from the request body/query —
// only the Host-header-derived tenant and the DB-verified account are used.
async function verifyTenant(
  account: VerifiedAccount,
  request: Request
): Promise<{ ok: true } | { ok: false; status: 403 }> {
  let club = await resolveTenantFromRequest(request);
  // Next's local dev server can normalize subdomain API requests to the
  // apex host. Keep local owner/member testing usable without weakening
  // production host-based tenant isolation.
  if (!club && process.env.NODE_ENV !== "production" && account.clubId) {
    const accountClub = await prisma.club.findUnique({
      where: { id: account.clubId },
      select: { slug: true },
    });
    if (accountClub) club = await resolveClubBySlug(accountClub.slug);
  }
  if (!isClubUsable(club)) return { ok: false, status: 403 };
  if (account.clubId !== club.id) return { ok: false, status: 403 };
  return { ok: true };
}

/** Any logged-in, active user of the CURRENT gym (MEMBER, ADMIN, OWNER, or COACH). */
export async function requireUser(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  const account = auth.account;
  if (account.role === "SUPER_ADMIN") return { ok: false, status: 403 };
  const tenant = await verifyTenant(account, request);
  if (!tenant.ok) return tenant;
  return { ok: true, user: account };
}

/** ADMIN or OWNER of the CURRENT gym only, and currently active. */
export async function requireAdmin(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  const account = auth.account;
  if (!["ADMIN", "OWNER"].includes(account.role?.toUpperCase())) {
    return { ok: false, status: 403 };
  }
  const tenant = await verifyTenant(account, request);
  if (!tenant.ok) return tenant;
  return { ok: true, user: account };
}

/** OWNER of the CURRENT gym only, and currently active. */
export async function requireOwner(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  const account = auth.account;
  if (account.role?.toUpperCase() !== "OWNER") {
    return { ok: false, status: 403 };
  }
  const tenant = await verifyTenant(account, request);
  if (!tenant.ok) return tenant;
  return { ok: true, user: account };
}

/** COACH of the CURRENT gym only, and currently active (not ADMIN/OWNER — staff manage coaches, they don't act as one). */
export async function requireCoach(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  const account = auth.account;
  if (account.role?.toUpperCase() !== "COACH") {
    return { ok: false, status: 403 };
  }
  const tenant = await verifyTenant(account, request);
  if (!tenant.ok) return tenant;
  return { ok: true, user: account };
}

/**
 * Platform-level only. Deliberately does NOT resolve or check a tenant —
 * SUPER_ADMIN accounts have clubId = null and operate across every gym from
 * the platform dashboard, not from any one gym's subdomain. This keeps
 * platform administration structurally separate from gym administration:
 * a SUPER_ADMIN token is never accepted by requireAdmin/requireOwner above
 * (their role isn't in the allowed list), and this function never accepts
 * a gym OWNER/ADMIN token either.
 */
export async function requireSuperAdmin(request: Request): Promise<AuthResult> {
  const auth = await authenticate(request);
  if (!auth.ok) return auth;
  if (auth.account.role !== "SUPER_ADMIN") return { ok: false, status: 403 };
  return { ok: true, user: auth.account };
}
