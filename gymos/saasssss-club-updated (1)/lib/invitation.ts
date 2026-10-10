// lib/invitation.ts
//
// Owner/admin-created accounts (members, staff, coaches) are NOT given a
// password by the creator. Instead the new account is created inactive and
// unverified, and the invitee receives a single-use link to set their own
// password (POST /api/auth/accept-invitation). Only the SHA-256 hash of the
// token is stored (same scheme as password-reset tokens).
import prisma from "@/lib/prisma";
import { generateResetToken, hashSecret } from "@/lib/otp";
import { sendEmail, invitationEmail } from "@/lib/email";
import { buildTenantOrigin } from "@/lib/tenant-url";
import { checkLimit, type LimitCheckResult } from "@/lib/plan-limits";

export const INVITATION_TTL_DAYS = 7;

export type InvitableRole = "OWNER" | "ADMIN" | "COACH" | "MEMBER";

// Who may create which role. SUPER_ADMIN is a platform role and is never
// assignable from inside a club, by anyone. OWNER → OWNER (co-owner) is kept
// because the staff screen has always allowed it; it is owner-only.
const ASSIGNABLE_ROLES: Record<string, readonly InvitableRole[]> = {
  OWNER: ["OWNER", "ADMIN", "COACH", "MEMBER"],
  ADMIN: ["COACH", "MEMBER"],
};

export function canAssignRole(actorRole: string | undefined | null, targetRole: string): boolean {
  const allowed = ASSIGNABLE_ROLES[(actorRole ?? "").toUpperCase()];
  return Boolean(allowed && (allowed as readonly string[]).includes(targetRole));
}

export function newInvitation(now = Date.now()) {
  const token = generateResetToken();
  return {
    token,
    tokenHash: hashSecret(token),
    expiry: new Date(now + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}

/**
 * Plan-limit check for an invitation. `countMembers` only counts ACTIVE
 * members, and an invited account is inactive until accepted — so without
 * counting live pending invitations too, an owner could exceed maxMembers by
 * inviting in bulk. Coaches/admins are already counted regardless of state.
 */
export async function checkInvitationLimit(clubId: string, role: InvitableRole): Promise<LimitCheckResult> {
  const key = role === "MEMBER" ? "maxMembers" : role === "COACH" ? "maxCoaches" : "maxAdmins";
  const result = await checkLimit(clubId, key);
  if (!result.ok || role !== "MEMBER") return result;
  if (typeof result.limit !== "number" || typeof result.current !== "number") return result;

  const pending = await prisma.user.count({
    where: {
      clubId,
      role: "MEMBER",
      isActive: false,
      invitationToken: { not: null },
      invitationExpiry: { gt: new Date() },
    },
  });
  if (result.current + pending >= result.limit) {
    return {
      ok: false,
      current: result.current + pending,
      limit: result.limit,
      upgrade: true,
      reason: `Limite atteinte : votre plan autorise ${result.limit} membres actifs (invitations en attente comprises). Passez à un plan supérieur pour en ajouter davantage.`,
    };
  }
  return result;
}

export function buildInvitationUrl(
  club: { slug: string; customDomain?: string | null },
  email: string,
  token: string,
  devFallbackOrigin?: string
): string {
  const origin = buildTenantOrigin(club, devFallbackOrigin);
  return `${origin}/user/accept-invitation?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

/**
 * Emails the invitation. Returns false (never throws) when sending fails, so
 * the caller can tell the admin to use "resend" instead of failing the whole
 * account creation.
 */
export async function sendInvitation(input: {
  clubId: string;
  invitee: { email: string; role: string };
  inviterName: string;
  token: string;
  devFallbackOrigin?: string;
}): Promise<boolean> {
  try {
    const club = await prisma.club.findUnique({
      where: { id: input.clubId },
      select: { slug: true, name: true, customDomain: true, settings: { select: { logoUrl: true } } },
    });
    if (!club) return false;
    const acceptUrl = buildInvitationUrl(club, input.invitee.email, input.token, input.devFallbackOrigin);
    const { subject, html } = invitationEmail({
      clubName: club.name,
      logoUrl: club.settings?.logoUrl,
      inviterName: input.inviterName,
      role: input.invitee.role,
      acceptUrl,
      expiresInDays: INVITATION_TTL_DAYS,
    });
    try {
      await sendEmail({ to: input.invitee.email, subject, html });
    } catch (sendError) {
      // Local dev without Resend configured: print the link so the flow can still be tested.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[invitation] Email not sent. Open this link manually: ${acceptUrl}`);
      }
      throw sendError;
    }
    return true;
  } catch (err) {
    console.error("Failed to send invitation email:", err instanceof Error ? err.message : err);
    return false;
  }
}
