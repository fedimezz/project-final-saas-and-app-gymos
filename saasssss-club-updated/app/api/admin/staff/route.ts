// GET  /api/admin/staff — list all staff accounts (OWNER)
// POST /api/admin/staff — invite a new staff account: created inactive with no
//   password; the invitee sets their own through the emailed link.
// OWNER only — staff management is a higher trust boundary than regular
// member admin actions, so this deliberately uses requireOwner, not
// requireAdmin.
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { formatZodError, inviteUserSchema } from "@/lib/validation";
import { toE164 } from "@/lib/phone";
import { canAssignRole, checkInvitationLimit, newInvitation, sendInvitation } from "@/lib/invitation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }

    const clubId = auth.user.clubId as string;
    const staff = await prisma.user.findMany({
      where: { clubId, role: { in: ["ADMIN", "OWNER"] } },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        avatar: true,
        createdAt: true,
        invitationToken: true,
      },
      orderBy: { createdAt: "asc" },
      take: 250,
    });

    // Never expose the token hash — only whether an invitation is pending.
    return NextResponse.json(
      staff.map(({ invitationToken, ...rest }) => ({ ...rest, invitationPending: Boolean(invitationToken) }))
    );
  } catch (error) {
    console.error("List staff error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOwner(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }
    const clubId = auth.user.clubId;
    if (!clubId) {
      return NextResponse.json({ error: "Club introuvable pour cet utilisateur." }, { status: 400 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = inviteUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, email: normalizedEmail, phone, country } = parsed.data;

    // This endpoint creates dashboard staff only. ADMIN (and co-OWNER) can only
    // ever be created by an OWNER; SUPER_ADMIN is never assignable.
    const staffRole = parsed.data.role ?? "ADMIN";
    if ((staffRole !== "ADMIN" && staffRole !== "OWNER") || !canAssignRole(auth.user.role, staffRole)) {
      return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });
    }

    // Plan limit check. Applies to OWNER additions too — countAdmins() counts
    // both roles, since an owner used to be able to dodge the seat limit
    // entirely by creating new staff as OWNER instead of ADMIN.
    const limitCheck = await checkInvitationLimit(clubId, staffRole);
    if (!limitCheck.ok) {
      return NextResponse.json({ error: limitCheck.reason }, { status: 402 });
    }

    const existing = await prisma.user.findFirst({ where: { clubId, email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Cet email est déjà utilisé" }, { status: 409 });
    }

    let normalizedPhone: string | null = null;
    if (phone) {
      normalizedPhone = toE164(phone, country);
      if (!normalizedPhone) {
        return NextResponse.json({ error: "Numéro de téléphone invalide" }, { status: 400 });
      }
    }

    const invitation = newInvitation();
    const staffMember = await prisma.user.create({
      data: {
        clubId,
        name,
        email: normalizedEmail,
        phone: normalizedPhone,
        country: country ?? null,
        password: null,
        role: staffRole,
        isActive: false, // activated when the invitation is accepted
        emailVerified: null,
        invitedBy: auth.user.id,
        invitationToken: invitation.tokenHash,
        invitationExpiry: invitation.expiry,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    const invitationSent = await sendInvitation({
      clubId,
      invitee: { email: staffMember.email, role: staffRole },
      inviterName: auth.user.name,
      token: invitation.token,
      devFallbackOrigin: new URL(request.url).origin,
    });

    runAfter(() =>
      logAction(request, {
        clubId,
        actorId: auth.user.id, actorName: auth.user.name, actorRole: auth.user.role,
        action: "STAFF_CREATED",
        category: "STAFF",
        targetId: staffMember.id, targetName: staffMember.name,
        detail: { role: staffRole, invitationSent },
      })
    );

    // Response keeps the staff member's fields at the top level (the staff
    // screen has always read them from there) and adds `invitationSent`.
    return NextResponse.json({ ...staffMember, invitationSent }, { status: 201 });
  } catch (error) {
    console.error("Create staff error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
