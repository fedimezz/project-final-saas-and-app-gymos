import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth-cookie";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/bcrypt";
import { withSubscriptionExpiry } from "@/lib/membership-card";
import { accountDeleteSchema, formatZodError, profileUpdateSchema } from "@/lib/validation";
import { logAction } from "@/lib/activity-log";

// GET /api/dashboard/profile
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Non authentifié" : "Accès refusé" },
        { status: auth.status }
      );
    }
    const payload = { id: auth.user.id };

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        createdAt: true,
        subscriptions: {
          where: {
            status: "ACTIVE",
            endDate: { gt: new Date() },
          },
          take: 1,
          include: { plan: true },
        },
        membershipCard: true,
        _count: {
          select: {
            attendances: true,
            userSessions: { where: { isCancelled: false } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        ...user,
        membershipCard: withSubscriptionExpiry(user.membershipCard, user.subscriptions[0] ?? null),
      },
    });
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/dashboard/profile
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Non authentifié" : "Accès refusé" },
        { status: auth.status }
      );
    }
    const payload = { id: auth.user.id };

    const rawBody = await request.json().catch(() => null);
    const parsed = profileUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, phone, avatar } = parsed.data;

    const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — only applies to the inline data: URL fallback below
    if (avatar) {
      const isDataUrl = avatar.startsWith("data:image/");

      // The normal path now is a Cloudinary secure_url returned by
      // /api/upload (see components/profile/ProfileAvatar.tsx) — that
      // route already enforces its own MIME/size checks server-side, so
      // there's nothing further to validate here for a URL.
      //
      // The data:image/... path is kept only as a fallback for callers
      // that still send a raw base64 payload (e.g. if CLOUDINARY_* env
      // vars aren't configured and /api/upload 500s). Since that gets
      // written directly into the users table, cap it so a bad client
      // can't grow that row unbounded.
      if (isDataUrl) {
        const base64Payload = avatar.split(",")[1] ?? "";
        const approxBytes = Math.floor((base64Payload.length * 3) / 4);
        if (approxBytes > MAX_AVATAR_BYTES) {
          return NextResponse.json(
            { error: "Image trop volumineuse (max 2MB)." },
            { status: 400 }
          );
        }
      }
    }

    const updateData: { name?: string; phone?: string | null; avatar?: string | null } = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (avatar !== undefined) updateData.avatar = avatar || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Aucune donnée à mettre à jour" },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: payload.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAction(request, {
      clubId: auth.user.clubId,
      actorId: auth.user.id,
      actorName: updatedUser.name,
      actorRole: auth.user.role,
      action: "PROFILE_UPDATED",
      category: "MEMBER",
      targetId: updatedUser.id,
      targetName: updatedUser.name,
      detail: { changedFields: Object.keys(updateData) },
    });

    return NextResponse.json({
      message: "Profil mis à jour avec succès",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/dashboard/profile — self-service account deletion.
// Requires the user's current password as confirmation. This was missing
// entirely, even though components/settings/DangerZoneCard.tsx already
// existed on the frontend expecting an endpoint like this to call.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "Non authentifié" : "Accès refusé" },
        { status: auth.status }
      );
    }
    const payload = { id: auth.user.id };

    const rawBody = await request.json().catch(() => null);
    const parsed = accountDeleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    if (!user.password) {
      return NextResponse.json(
        {
          error:
            "Ce compte utilise la connexion Google et n'a pas de mot de passe. Contactez le support pour supprimer votre compte.",
        },
        { status: 400 }
      );
    }

    const validPassword = await verifyPassword(password, user.password);
    if (!validPassword) {
      return NextResponse.json({ error: "Mot de passe incorrect" }, { status: 401 });
    }

    if (user.role === "OWNER") {
      return NextResponse.json(
        { error: "Le compte propriétaire ne peut pas être supprimé depuis cette page." },
        { status: 403 }
      );
    }

    // Cascade deletes (subscriptions, payments via subscriptions,
    // notifications, preferences, member reports, etc.) are handled by the
    // `onDelete: Cascade` relations already defined in the Prisma schema.
    await prisma.user.delete({ where: { id: payload.id } });

    const response = NextResponse.json({ message: "Compte supprimé" });
    clearAuthCookie(response, request.url);
    return response;
  } catch (error) {
    console.error("Profile DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
