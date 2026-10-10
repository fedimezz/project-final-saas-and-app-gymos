// GET  /api/admin/members?search=&page= — paginated, searchable member list (ADMIN + OWNER)
// POST /api/admin/members — invite a new member/coach (ADMIN + OWNER). The
// account is created inactive with NO password; the invitee receives a link
// to set their own (see lib/invitation.ts).
//
// NOTE: this file was missing entirely, which is why the members page in the
// admin dashboard was getting a 404 (and the client tried to JSON.parse the
// Next.js HTML 404 page, producing "Unexpected token '<'").
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { formatZodError, inviteUserSchema } from "@/lib/validation";
import { toE164 } from "@/lib/phone";
import { canAssignRole, checkInvitationLimit, newInvitation, sendInvitation, type InvitableRole } from "@/lib/invitation";
import { logAction } from "@/lib/activity-log";
import { runAfter } from "@/lib/after";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") ?? "").trim();
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const where = {
      clubId: auth.user.clubId,
      role: "MEMBER" as const,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          invitationToken: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              endDate: true,
              plan: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    const members = users.map((u) => {
      const sub = u.subscriptions[0];
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        invitationPending: Boolean(u.invitationToken),
        subscription: sub
          ? { status: sub.status, planName: sub.plan.name, endDate: sub.endDate }
          : null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return NextResponse.json({
      members,
      pagination: { page, totalPages, total, pageSize: PAGE_SIZE },
    });
  } catch (error) {
    console.error("List members error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    }
    const actor = auth.user;
    const clubId = actor.clubId;
    if (!clubId) {
      return NextResponse.json({ error: "Club introuvable pour cet utilisateur." }, { status: 400 });
    }

    const rawBody = await request.json().catch(() => null);
    const parsed = inviteUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, email: normalizedEmail, phone, country } = parsed.data;
    const role = (parsed.data.role ?? "MEMBER") as string;

    // Role assignment is checked against the CALLER's role, never trusted from
    // the body: nobody can mint a SUPER_ADMIN here, and an ADMIN can only
    // create coaches and members.
    if (!canAssignRole(actor.role, role)) {
      return NextResponse.json({ error: "Vous n'avez pas le droit de créer ce type de compte" }, { status: 403 });
    }
    const invitedRole = role as InvitableRole;

    // Creating a member needs members.write; creating anyone on the team
    // (coach/admin) needs staff.manage.
    const requiredPermission = invitedRole === "MEMBER" ? "members.write" : "staff.manage";
    if (!(await hasPermission(actor, requiredPermission))) {
      return NextResponse.json(
        {
          error:
            invitedRole === "MEMBER"
              ? "Permission requise : ajouter/modifier des membres"
              : "Permission requise : gérer l'équipe",
        },
        { status: 403 }
      );
    }

    // ── Plan limit check (counts pending invitations too) ───────────────────
    const limitCheck = await checkInvitationLimit(clubId, invitedRole);
    if (!limitCheck.ok) {
      return NextResponse.json(
        { error: limitCheck.reason, upgrade: Boolean(limitCheck.upgrade) },
        { status: 402 }
      );
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
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          clubId,
          name,
          email: normalizedEmail,
          phone: normalizedPhone,
          country: country ?? null,
          password: null,
          role: invitedRole,
          isActive: false, // activated when the invitation is accepted
          emailVerified: null,
          invitedBy: actor.id,
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
      if (invitedRole === "COACH") {
        // A COACH login is only useful with its coach profile.
        await tx.coach.create({
          data: { clubId, name, phone: normalizedPhone, specialties: [], userId: created.id },
        });
      }
      return created;
    });

    const invitationSent = await sendInvitation({
      clubId,
      invitee: { email: member.email, role: invitedRole },
      inviterName: actor.name,
      token: invitation.token,
      devFallbackOrigin: new URL(request.url).origin,
    });

    runAfter(() =>
      logAction(request, {
        clubId,
        actorId: actor.id, actorName: actor.name, actorRole: actor.role,
        action: "USER_INVITED",
        category: "STAFF",
        targetId: member.id, targetName: member.name,
        detail: { role: invitedRole, invitationSent },
      })
    );

    return NextResponse.json({ member, invitationSent }, { status: 201 });
  } catch (error) {
    console.error("Create member error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
