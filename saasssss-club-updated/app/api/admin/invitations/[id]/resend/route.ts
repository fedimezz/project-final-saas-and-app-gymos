// POST /api/admin/invitations/:id/resend
// Issues a fresh invitation link (new token, new 7-day expiry) for an account
// that was created by invitation and hasn't accepted yet, and emails it. The
// previous link stops working immediately.
//
// Same authority rules as creating the account: the caller must be allowed to
// assign that role, and hold members.write (members) / staff.manage (team).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { canAssignRole, newInvitation, sendInvitation } from "@/lib/invitation";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: "Accès refusé" }, { status: auth.status });
    const actor = auth.user;
    const clubId = actor.clubId;
    if (!clubId) return NextResponse.json({ error: "Club introuvable pour cet utilisateur." }, { status: 400 });

    const { id } = await params;

    // Tenant-scoped lookup: an id from another club simply isn't found.
    const target = await prisma.user.findFirst({
      where: { id, clubId },
      select: { id: true, email: true, role: true, isActive: true, invitationToken: true, password: true },
    });
    if (!target || !target.invitationToken || target.password) {
      return NextResponse.json({ error: "Aucune invitation en attente pour ce compte" }, { status: 404 });
    }
    if (!canAssignRole(actor.role, target.role)) {
      return NextResponse.json({ error: "Vous n'avez pas le droit de gérer ce compte" }, { status: 403 });
    }
    const requiredPermission = target.role === "MEMBER" ? "members.write" : "staff.manage";
    if (!(await hasPermission(actor, requiredPermission))) {
      return NextResponse.json({ error: "Permission insuffisante" }, { status: 403 });
    }

    // Avoid using the endpoint as an email cannon at someone's inbox.
    const rl = await checkRateLimit(`invite-resend:${target.id}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Trop de renvois. Réessayez plus tard." }, { status: 429 });
    }

    const invitation = newInvitation();
    await prisma.user.update({
      where: { id: target.id },
      data: { invitationToken: invitation.tokenHash, invitationExpiry: invitation.expiry, invitedBy: actor.id },
    });

    const invitationSent = await sendInvitation({
      clubId,
      invitee: { email: target.email, role: target.role },
      inviterName: actor.name,
      token: invitation.token,
      devFallbackOrigin: new URL(request.url).origin,
    });

    return NextResponse.json({ invitationSent });
  } catch (error) {
    console.error("Resend invitation error:", error);
    return NextResponse.json({ error: "Une erreur est survenue" }, { status: 500 });
  }
}
