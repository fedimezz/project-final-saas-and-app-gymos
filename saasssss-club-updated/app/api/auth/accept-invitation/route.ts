// GET  /api/auth/accept-invitation?email=&token= — describe a pending invitation
//        (club name, who invited, role) so the page can greet the invitee.
//        Read-only; needs the secret token, so it leaks nothing to guessers.
// POST /api/auth/accept-invitation { email, token, password, confirmPassword }
//        — the invitee chooses their password; the account is activated, the
//        token is burned (single use) and the user is signed in.
//
// The tenant comes from the Host header only (the emailed link points at the
// club's own host, see lib/invitation.ts), never from the request body.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { hashPassword } from "@/lib/bcrypt";
import { hashSecret } from "@/lib/otp";
import { generateToken } from "@/lib/auth";
import { setAuthCookie } from "@/lib/auth-cookie";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { acceptInvitationSchema, emailSchema, formatZodError } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const INVALID = () =>
  NextResponse.json({ error: "Lien d'invitation invalide ou expiré" }, { status: 400 });

function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

async function throttled(request: NextRequest, email: string): Promise<boolean> {
  const byIp = await checkRateLimit(`accept-invite:ip:${getClientIp(request)}`, 30, 15 * 60 * 1000);
  const byEmail = await checkRateLimit(`accept-invite:email:${email}`, 10, 15 * 60 * 1000);
  return !byIp.allowed || !byEmail.allowed;
}

async function findPendingInvitation(request: NextRequest, email: string, token: string) {
  const tenant = await resolveTenantFromRequest(request);
  if (!tenant || !isClubUsable(tenant)) return null;

  const user = await prisma.user.findFirst({ where: { clubId: tenant.id, email } });
  if (!user || !user.invitationToken || !user.invitationExpiry) return null;
  if (user.role === "SUPER_ADMIN") return null;
  if (user.invitationExpiry < new Date()) return null;
  if (!safeEqualHex(hashSecret(token), user.invitationToken)) return null;

  return { tenant, user };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = emailSchema.safeParse(searchParams.get("email") ?? "");
    const token = (searchParams.get("token") ?? "").trim();
    if (!email.success || token.length < 10 || token.length > 500) return INVALID();

    if (await throttled(request, email.data)) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
    }

    const found = await findPendingInvitation(request, email.data, token);
    if (!found) return INVALID();

    const inviter = found.user.invitedBy
      ? await prisma.user.findFirst({
          where: { id: found.user.invitedBy, clubId: found.tenant.id },
          select: { name: true },
        })
      : null;

    return NextResponse.json({
      invitation: {
        email: found.user.email,
        name: found.user.name,
        role: found.user.role,
        clubName: found.tenant.name,
        invitedByName: inviter?.name ?? null,
        expiresAt: found.user.invitationExpiry,
      },
    });
  } catch (error) {
    console.error("Invitation lookup error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const parsed = acceptInvitationSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email, token, password } = parsed.data;

    if (await throttled(request, email)) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
    }

    const found = await findPendingInvitation(request, email, token);
    if (!found) return INVALID();
    const { tenant, user } = found;

    const hashedPassword = await hashPassword(password);

    // Single-use, race-safe: the update only matches while the stored token
    // hash is still the one we validated, so two concurrent accepts can't both win.
    const activated = await prisma.user.updateMany({
      where: { id: user.id, clubId: tenant.id, invitationToken: user.invitationToken },
      data: {
        password: hashedPassword,
        emailVerified: new Date(),
        isActive: true,
        invitationToken: null,
        invitationExpiry: null,
        verificationCodeHash: null,
        verificationCodeExpiry: null,
      },
    });
    if (activated.count !== 1) return INVALID();

    const jwt = generateToken(
      { id: user.id, email: user.email, role: user.role, name: user.name, clubId: user.clubId },
      "7d"
    );
    const response = NextResponse.json({
      message: "Compte activé",
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      club: { name: tenant.name, slug: tenant.slug },
    });
    setAuthCookie(response, jwt, request.url, { maxAgeSeconds: 60 * 60 * 24 * 7 });

    runAfter(() =>
      logAction(request, {
        clubId: tenant.id,
        actorId: user.id, actorName: user.name, actorRole: user.role,
        action: "INVITATION_ACCEPTED",
        category: "AUTH",
      })
    );

    return response;
  } catch (error) {
    console.error("Accept invitation error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
