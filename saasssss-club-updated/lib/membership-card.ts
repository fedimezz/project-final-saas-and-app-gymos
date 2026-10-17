// The member card's own `expiresAt` column is just "issued date + 1 year" — it
// has nothing to do with the member's paid subscription (and certainly not with
// the club's SaaS plan). What members expect to see on the card is when THEIR
// abonnement ends, so every API that returns the card runs it through here.
interface CardLike {
  isActive: boolean;
  expiresAt: Date | string;
}
interface SubscriptionLike {
  endDate: Date | string;
}

export function withSubscriptionExpiry<C extends CardLike>(
  card: C | null,
  activeSubscription: SubscriptionLike | null
): (Omit<C, "expiresAt" | "isActive"> & { expiresAt: Date | string | null; isActive: boolean }) | null {
  if (!card) return null;
  return {
    ...card,
    isActive: card.isActive && !!activeSubscription,
    expiresAt: activeSubscription ? activeSubscription.endDate : null,
  };
}
