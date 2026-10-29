// Theme + 3D model lock. After a club's setup is confirmed, GymSettings.designLockedAt is set and
// themeId / heroModel can only change through a one-time grant:
//
//   owner files a DesignChangeRequest  →  SUPER_ADMIN approves (grant valid GRANT_TTL_DAYS)  →
//   owner applies it (/api/admin/design-change/apply)  →  the database consumes the grant.
//
// Defence in depth: the API checks below give friendly 423 answers, but the real guarantee is the
// Postgres triggers in migration 20261017000100_design_lock — a route that forgets to check still
// cannot change a locked theme/model, and a grant can be spent exactly once, only on what was
// approved, only for its own club. prisma/tests/design-lock.test.sql proves it against Postgres.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const GRANT_TTL_DAYS = 7;
export const DESIGN_LOCKED_CODE = "DESIGN_LOCKED";

/** True when a Prisma/driver error comes from the design-lock trigger. */
export function isDesignLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(DESIGN_LOCKED_CODE);
}

export function designLockedResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Le thème et le modèle 3D de votre site sont verrouillés. Envoyez une demande de changement : après validation par l'équipe ClubX, vous disposerez d'un changement unique.",
      code: DESIGN_LOCKED_CODE,
      locked: true,
    },
    { status: 423 }
  );
}

/** Marks approved-but-expired grants EXPIRED so they stop blocking a new request. Scoped to one club. */
export async function expireStaleGrants(clubId: string): Promise<void> {
  await prisma.designChangeRequest.updateMany({
    where: { clubId, status: "APPROVED", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

/** The club's usable grant (approved, unexpired, unspent), if any. Always scoped by clubId. */
export function findActiveGrant(clubId: string) {
  return prisma.designChangeRequest.findFirst({
    where: { clubId, status: "APPROVED", expiresAt: { gt: new Date() }, consumedAt: null },
    orderBy: { reviewedAt: "asc" },
  });
}

export async function isDesignLocked(clubId: string): Promise<boolean> {
  const settings = await prisma.gymSettings.findUnique({ where: { clubId }, select: { designLockedAt: true } });
  return !!settings?.designLockedAt;
}
