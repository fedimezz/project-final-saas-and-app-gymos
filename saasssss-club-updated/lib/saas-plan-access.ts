// Which SaaS plans a customer may pick. One definition, used by every route that accepts a
// planId from a client, so "Starter is no longer offered" cannot be bypassed by posting an id.
//
//  - NEW customers (onboarding, public catalogue): active AND public only.
//  - EXISTING clubs (checkout / reactivation / manual payment): active AND (public OR the plan
//    the club is already on), so a club on a withdrawn plan can still pay to keep it.
//  - SUPER_ADMIN assignment (/api/platform/*) is deliberately not restricted here.
import prisma from "@/lib/prisma";

export const PUBLIC_PLAN_WHERE = { isActive: true, isPublic: true } as const;

export function findPublicPlan(planId: string) {
  return prisma.saasPlan.findFirst({ where: { id: planId, ...PUBLIC_PLAN_WHERE } });
}

export function findPlanForClub(planId: string, currentPlanId?: string | null) {
  return prisma.saasPlan.findFirst({
    where: {
      id: planId,
      isActive: true,
      OR: [{ isPublic: true }, ...(currentPlanId ? [{ id: currentPlanId }] : [])],
    },
  });
}
