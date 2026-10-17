import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, dummyPasswordCheck } from "@/lib/bcrypt";
import crypto from "crypto";
import { generateToken, generateBridgeToken, hashBridgeNonce } from "@/lib/auth";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { setAuthCookie } from "@/lib/auth-cookie";
import { resolveTenantFromRequest, isClubUsable } from "@/lib/tenant";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { formatZodError, loginSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

// One message for every credential failure — unknown email, wrong password,
// password-less (Google) account. Distinct messages (and distinct timing) let
// an attacker enumerate which emails have accounts. The Google hint is shown
// to everybody, so it reveals nothing.
const INVALID_CREDENTIALS =
  "Email ou mot de passe incorrect. Si vous avez créé votre compte avec Google, utilisez « Continuer avec Google ».";

const MAX_OWNER_PORTAL_CANDIDATES = 5;

// The native mobile app has no httpOnly-cookie jar shared with fetch() the
// way a browser does, so it needs the raw JWT to store itself (SecureStore)
// and send back as `Authorization: Bearer <token>`. Gated behind this header
// rather than always returning the token: doing it unconditionally would
// hand any XSS on the WEB app a way to read the token straight out of the
// JSON response, defeating the point of the httpOnly cookie for that client.
// The web client never sends this header, so its response shape is
// byte-for-byte unchanged.
const MOBILE_CLIENT_HEADER = "x-client-type";
const isMobileClient = (request: Request) =>
  request.headers.get(MOBILE_CLIENT_HEADER) === "mobile-app";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { email: normalizedEmail, password, rememberMe } = parsed.data;
    const ownerPortal = rawBody?.portal === "owner";

    // Which gym is this login for? Resolved from the Host header only —
    // never from anything in the request body. A request on the apex/
    // platform host (no tenant) can only ever be a SUPER_ADMIN login or the
    // owner portal: it has no gym context to match a gym user against.
    const tenant = await resolveTenantFromRequest(request);
    if (tenant && !isClubUsable(tenant)) {
      return NextResponse.json(
        { error: "Ce club n'est plus disponible." },
        { status: 403 }
      );
    }

    // Second throttle, per target account (the per-IP one above doesn't stop a
    // botnet spraying guesses at ONE email). Generous enough that a real user
    // mistyping never trips it.
    const perEmail = await checkRateLimit(
      `login-email:${tenant?.id ?? "platform"}:${normalizedEmail}`,
      20,
      15 * 60 * 1000
    );
    if (!perEmail.allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes." },
        { status: 429 }
      );
    }

    const candidates = await prisma.user.findMany({
      where: tenant
        ? { clubId: tenant.id, email: normalizedEmail }
        : ownerPortal
          ? { email: normalizedEmail, role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] } }
          : { clubId: null, email: normalizedEmail, role: "SUPER_ADMIN" },
      // Deterministic order: the owner portal can match the same email in
      // several clubs, and "whichever row Postgres returns first" is not a
      // rule.
      orderBy: { createdAt: "asc" },
      take: MAX_OWNER_PORTAL_CANDIDATES,
      include: {
        club: { select: { slug: true, name: true } },
        subscriptions: {
          where: {
            status: "ACTIVE",
            endDate: { gt: new Date() },
          },
          take: 1,
          include: {
            plan: true,
          },
        },
        membershipCard: true,
      },
    });

    // Verify the password against EVERY candidate (or burn an equivalent
    // dummy compare when there are none / they have no password) BEFORE
    // revealing anything about the account's state.
    const matches: typeof candidates = [];
    if (candidates.length === 0) {
      await dummyPasswordCheck(password);
    } else {
      for (const candidate of candidates) {
        const ok = candidate.password
          ? await verifyPassword(password, candidate.password)
          : await dummyPasswordCheck(password);
        if (ok) matches.push(candidate);
      }
    }

    if (matches.length === 0) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    if (matches.length > 1) {
      // Same email + same password in several clubs, on the club-less owner
      // portal: don't guess. The caller now proved the password, so listing
      // the clubs is not an enumeration leak.
      return NextResponse.json(
        {
          error: "Plusieurs clubs sont associés à ce compte. Connectez-vous depuis l'adresse de votre club.",
          clubs: matches
            .filter((m) => m.club)
            .map((m) => ({ slug: m.club!.slug, name: m.club!.name })),
        },
        { status: 409 }
      );
    }

    const user = matches[0];

    // Account state is only disclosed to someone who knows the password.
    if (!user.isActive) {
      return NextResponse.json(
        { error: "Votre compte a été désactivé. Contactez l'administrateur." },
        { status: 401 }
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: "Veuillez vérifier votre email avant de vous connecter.",
          requiresVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    const expiresIn = rememberMe ? "30d" : "7d";
    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        clubId: user.clubId,
      },
      expiresIn
    );

    const activeSubscription = user.subscriptions[0] || null;

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      membershipCard: user.membershipCard,
      subscription: activeSubscription
        ? {
            id: activeSubscription.id,
            plan: activeSubscription.plan.name,
            endDate: activeSubscription.endDate,
            status: activeSubscription.status,
          }
        : null,
      club: user.club,
    };

    // Local dev only: the owner portal logs in on the apex (localhost), but a
    // cookie set on localhost is never sent to {slug}.localhost, so the club
    // dashboard would see a logged-out user. Hand the session over through
    // the one-time bridge instead. In production the session cookie is
    // Domain=.apex, which already reaches {slug}.apex, so nothing changes.
    let bridgeUrl: string | undefined;
    if (
      process.env.NODE_ENV !== "production" &&
      !tenant &&
      user.clubId &&
      user.club?.slug &&
      ["OWNER", "ADMIN"].includes(user.role.toUpperCase())
    ) {
      const bridgeToken = generateBridgeToken({
        id: user.id,
        clubId: user.clubId,
        nonceHash: hashBridgeNonce(crypto.randomUUID()),
      });
      const clubOrigin = buildTenantOrigin({ slug: user.club.slug }, new URL(request.url).origin);
      bridgeUrl =
        `${clubOrigin}/api/auth/bridge?token=${encodeURIComponent(bridgeToken)}` +
        `&redirect=${encodeURIComponent("/admin")}`;
    }

    const response = NextResponse.json({
      message: "Connexion réussie",
      user: userData,
      ...(bridgeUrl ? { bridgeUrl } : {}),
      ...(isMobileClient(request) ? { token } : {}),
    });

    runAfter(() =>
      logAction(request, {
        clubId: user.clubId,
        actorId: user.id, actorName: user.name, actorRole: user.role,
        action: "USER_LOGIN",
        category: "AUTH",
        detail: { rememberMe },
      })
    );

    setAuthCookie(response, token, request.url, {
      maxAgeSeconds: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7,
      // A platform-admin session must never be sent to tenant subdomains
      // (any club owner controls a page on one). Club-level sessions keep
      // the shared cookie: the owner-portal flow depends on it reaching
      // {slug}.host, and tenant isolation is enforced server-side per request.
      hostOnly: user.role === "SUPER_ADMIN",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Une erreur est survenue lors de la connexion" },
      { status: 500 }
    );
  }
}
