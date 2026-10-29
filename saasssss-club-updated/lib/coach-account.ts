// lib/coach-account.ts
//
// Creates the login account of a coach the way every other staff account is created:
// NO password chosen by the owner. The account is inactive until the coach opens the
// emailed link (/user/accept-invitation) and sets their own password.
import prisma from "@/lib/prisma";
import { newInvitation, sendInvitation } from "@/lib/invitation";

export type CoachAccountResult =
  | { ok: true; userId: string; invitationSent: boolean }
  | { ok: false; status: number; error: string };

export async function createInvitedCoachAccount(input: {
  clubId: string;
  name: string;
  email: string;
  phone?: string | null;
  inviter: { id: string; name: string };
  requestUrl: string;
}): Promise<CoachAccountResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findFirst({ where: { clubId: input.clubId, email }, select: { id: true } });
  if (existing) return { ok: false, status: 409, error: "Cet email est déjà utilisé" };

  const invitation = newInvitation();
  const user = await prisma.user.create({
    data: {
      clubId: input.clubId,
      name: input.name,
      email,
      phone: input.phone || null,
      password: null,
      role: "COACH",
      isActive: false, // activated when the invitation is accepted
      emailVerified: null,
      invitedBy: input.inviter.id,
      invitationToken: invitation.tokenHash,
      invitationExpiry: invitation.expiry,
    },
    select: { id: true },
  });

  const invitationSent = await sendInvitation({
    clubId: input.clubId,
    invitee: { email, role: "COACH" },
    inviterName: input.inviter.name,
    token: invitation.token,
    devFallbackOrigin: new URL(input.requestUrl).origin,
  });

  return { ok: true, userId: user.id, invitationSent };
}
