// lib/oauth-state.ts
//
// Signed, self-contained `state` for the Google OAuth round trip.
//
// The flow starts on the CLUB's host (club-a.host) but Google always calls
// back on the single apex redirect_uri. A cookie set on the club host is not
// readable on the apex in local dev (localhost vs club-a.localhost), so the
// old cookie-based CSRF check failed there. Instead the state carries
// everything the callback needs, HMAC-signed with JWT_SECRET:
//   - c: the club id the flow belongs to
//   - n: sha256 of a nonce whose raw value lives in a host-only cookie on the
//        club host (redeemed at /api/auth/bridge — this is what binds the
//        result to the browser that started the flow)
//   - e: expiry (10 min)
import crypto from "crypto";

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set.");
  return s;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(`google-oauth-state:${body}`).digest("base64url");
}

export function createGoogleState(input: { clubId: string; nonceHash: string }): string {
  const body = Buffer.from(
    JSON.stringify({
      c: input.clubId,
      n: input.nonceHash,
      e: Date.now() + TTL_MS,
      r: crypto.randomBytes(8).toString("hex"),
    })
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyGoogleState(state: string | null | undefined): { clubId: string; nonceHash: string } | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      c?: unknown;
      n?: unknown;
      e?: unknown;
    };
    if (typeof parsed.c !== "string" || typeof parsed.n !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    return { clubId: parsed.c, nonceHash: parsed.n };
  } catch {
    return null;
  }
}
