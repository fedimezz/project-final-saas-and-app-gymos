// GET /api/dashboard/settings — the logged-in member's preferences
// PUT /api/dashboard/settings — update language / theme / notification channels
//
// FIX: this file used to be a byte-for-byte copy of the notifications route
// (it even still said "GET /api/notifications" in its own comment) — so
// hitting /api/dashboard/settings never touched UserPreferences at all,
// and there was no PUT handler, meaning the settings page (which didn't
// exist either — see app/dashboard/settings/page.tsx) had nothing to save to.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatZodError, userPreferencesSchema } from "@/lib/validation";

async function getOrCreatePreferences(userId: string) {
  const existing = await prisma.userPreferences.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userPreferences.create({ data: { userId } });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });

    const preferences = await getOrCreatePreferences(auth.user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Dashboard settings GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return NextResponse.json({ error: "Non autorisé" }, { status: auth.status });

    const rawBody = await request.json().catch(() => null);
    const parsed = userPreferencesSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { language, darkMode, emailNotifications, pushNotifications, smsNotifications } = parsed.data;

    await getOrCreatePreferences(auth.user.id);

    const preferences = await prisma.userPreferences.update({
      where: { userId: auth.user.id },
      data: {
        ...(language !== undefined && { language }),
        ...(darkMode !== undefined && { darkMode }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(smsNotifications !== undefined && { smsNotifications }),
      },
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Dashboard settings PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
