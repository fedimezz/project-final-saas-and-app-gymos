// /api/devices — push-notification device registration (mobile app).
//
//  POST   { token, platform, deviceName?, appVersion? }  register / refresh this device
//  DELETE { token }                                       unregister (logout, notifications off)
//  GET                                                    list MY registered devices (token masked)
//
// Security model
//  - Authenticated (proxy + requireUser), MEMBER or COACH only — those are the
//    roles the mobile app serves.
//  - clubId always comes from the verified session, never from the body.
//  - A push token belongs to ONE account at a time. If another account signs in
//    on the same phone, registering re-assigns the row, so the previous user
//    (possibly in another club) stops receiving that phone's notifications.
//  - Only the owner of a token can unregister it; tokens are never returned in
//    full by GET.
//  - Token format is validated (Expo push tokens), writes are rate-limited,
//    and a user keeps at most MAX_DEVICES active devices (oldest are retired).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatZodError } from "@/lib/validation";
import { isValidExpoPushToken } from "@/lib/push";

const MAX_DEVICES = 10;
const PUSH_ROLES = new Set(["MEMBER", "COACH"]);

const registerSchema = z.object({
  token: z.string().refine(isValidExpoPushToken, "Jeton de notification invalide"),
  platform: z.enum(["ios", "android"], { message: "Plateforme invalide" }),
  deviceName: z.string().trim().max(80).optional(),
  appVersion: z.string().trim().max(32).optional(),
});

const unregisterSchema = z.object({
  token: z.string().refine(isValidExpoPushToken, "Jeton de notification invalide"),
});

function maskToken(token: string): string {
  return token.length <= 14 ? "••••" : `${token.slice(0, 18)}…${token.slice(-4)}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const user = auth.user;
    if (!PUSH_ROLES.has(String(user.role).toUpperCase())) {
      return NextResponse.json({ error: "Notifications push réservées aux membres et coachs" }, { status: 403 });
    }
    const clubId = user.clubId as string;

    const rl = await checkRateLimit(`device-register:${user.id}`, 30, 60 * 60 * 1000);
    if (!rl.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

    const parsed = registerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    const { token, platform, deviceName, appVersion } = parsed.data;

    // Upsert by token: creating, refreshing, or moving it to the account that
    // is signed in on this phone right now.
    await prisma.deviceToken.upsert({
      where: { token },
      create: { clubId, userId: user.id, token, platform, deviceName, appVersion },
      update: {
        clubId,
        userId: user.id,
        platform,
        deviceName,
        appVersion,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    // Keep the table bounded per user: retire everything past the newest MAX_DEVICES.
    const active = await prisma.deviceToken.findMany({
      where: { userId: user.id, clubId, isActive: true },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    if (active.length > MAX_DEVICES) {
      await prisma.deviceToken.updateMany({
        where: { id: { in: active.slice(MAX_DEVICES).map((d) => d.id) } },
        data: { isActive: false },
      });
    }

    return NextResponse.json({ registered: true });
  } catch (error) {
    console.error("Devices POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const user = auth.user;

    const parsed = unregisterSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });

    // Scoped to the caller: nobody can unregister somebody else's device.
    // Idempotent — an unknown token is simply "already gone".
    await prisma.deviceToken.deleteMany({
      where: { token: parsed.data.token, userId: user.id, clubId: user.clubId as string },
    });
    return NextResponse.json({ unregistered: true });
  } catch (error) {
    console.error("Devices DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });
    const user = auth.user;

    const devices = await prisma.deviceToken.findMany({
      where: { userId: user.id, clubId: user.clubId as string, isActive: true },
      orderBy: { lastSeenAt: "desc" },
      select: { token: true, platform: true, deviceName: true, appVersion: true, lastSeenAt: true },
    });
    return NextResponse.json({
      devices: devices.map((d) => ({ ...d, token: maskToken(d.token) })),
    });
  } catch (error) {
    console.error("Devices GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
