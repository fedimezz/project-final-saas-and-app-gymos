// lib/service-pricing.ts — the single place prices for optional paid services
// are read. No amount is hardcoded anywhere: if SUPER_ADMIN has not set (or has
// deactivated) a price, ordering that service is refused instead of silently
// falling back to a default.
import prisma from "@/lib/prisma";
import type { ServiceType } from "@/lib/service-catalog";

export class PriceNotConfiguredError extends Error {
  constructor(public readonly serviceType: ServiceType) {
    super(`No active price configured for ${serviceType}`);
    this.name = "PriceNotConfiguredError";
  }
}

/** Current active price for a service. The caller snapshots it on the request. */
export async function getActiveServicePrice(
  serviceType: ServiceType
): Promise<{ price: number; currency: string }> {
  const row = await prisma.servicePrice.findUnique({
    where: { serviceType },
    select: { price: true, currency: true, isActive: true },
  });
  if (!row || !row.isActive) throw new PriceNotConfiguredError(serviceType);
  return { price: row.price, currency: row.currency };
}
