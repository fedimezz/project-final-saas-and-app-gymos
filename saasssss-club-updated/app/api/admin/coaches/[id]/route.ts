import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { createInvitedCoachAccount } from "@/lib/coach-account";
import { coachUpdateSchema, formatZodError } from "@/lib/validation";

// PUT /api/admin/coaches/[id] — edit a coach profile. OWNER only.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé — réservé au propriétaire" }, { status: auth.status });

  try {
    const { id } = await params;
    const rawBody = await request.json().catch(() => null);
    const parsed = coachUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { name, bio, photoUrl, specialties, phone, isActive, createAccount, email } = parsed.data;

    const existing = await prisma.coach.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Coach introuvable" }, { status: 404 });
    }

    let userId = existing.userId;
    let invitationSent: boolean | null = null;

    // Attach a login account to a coach that didn't have one yet.
    if (createAccount && !existing.userId) {
      if (!email) {
        return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
      }
      const account = await createInvitedCoachAccount({
        clubId: auth.user.clubId as string,
        name: name || existing.name,
        email,
        phone: phone || existing.phone,
        inviter: { id: auth.user.id, name: auth.user.name },
        requestUrl: request.url,
      });
      if (!account.ok) return NextResponse.json({ error: account.error }, { status: account.status });
      userId = account.userId;
      invitationSent = account.invitationSent;
    }

    const coach = await prisma.coach.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio: bio || null }),
        ...(photoUrl !== undefined && { photoUrl: photoUrl || null }),
        ...(specialties !== undefined && { specialties }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(isActive !== undefined && { isActive }),
        userId,
      },
    });

    // Keep every session's free-text display name (Session.coach) in sync
    // when the coach is renamed, since older code paths still read it.
    if (name !== undefined && name !== existing.name) {
      await prisma.session.updateMany({ where: { coachId: id }, data: { coach: name } });
    }

    return NextResponse.json({ coach, invitationSent });
  } catch (error) {
    console.error("Admin coach PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/coaches/[id] — retire a coach. Never hard-deletes one
// with sessions attached (would orphan the schedule); deactivates instead.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ error: "Accès refusé — réservé au propriétaire" }, { status: auth.status });

  try {
    const { id } = await params;
    const existing = await prisma.coach.findFirst({ where: { id, clubId: auth.user.clubId as string } });
    if (!existing) {
      return NextResponse.json({ error: "Coach introuvable" }, { status: 404 });
    }
    const sessionCount = await prisma.session.count({ where: { coachId: id } });

    if (sessionCount > 0) {
      const coach = await prisma.coach.update({ where: { id }, data: { isActive: false } });
      return NextResponse.json({ coach, softDeleted: true });
    }

    await prisma.coach.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Admin coach DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
