"use client";

import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import { canStripeChargeMembershipCurrency, formatMembershipPrice } from "@/lib/payment-currencies";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

interface Props {
  plans: Plan[];
  currentPlanId?: string | null;
  hasPendingOrActive: boolean;
  onSelect: (plan: Plan) => void;
  countryCode: string;
}

function monthlyEquivalent(price: number, durationDays: number) {
  const months = durationDays / 30;
  return Math.round((price / months) * 100) / 100;
}

export default function PlansList({ plans, currentPlanId, hasPendingOrActive, onSelect, countryCode }: Props) {
  if (plans.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <p className="text-muted">Aucun plan disponible pour le moment.</p>
      </div>
    );
  }

  // Featured = best price-per-month among the plans, not just "the middle one".
  const featuredId = plans.reduce((best, p) =>
    monthlyEquivalent(p.price, p.durationDays) < monthlyEquivalent(best.price, best.durationDays)
      ? p
      : best
  , plans[0]).id;

  const isInternational = !!countryCode && countryCode !== "TN";

  return (
    <PlanRowList className="max-w-none">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        const isFeatured = plan.id === featuredId && plans.length > 1;
        const stripeCurrencyUnsupported = isInternational && !canStripeChargeMembershipCurrency(plan.currency);
        const blocked = isCurrent || hasPendingOrActive || stripeCurrencyUnsupported;

        return (
          <PlanRowCard
            key={plan.id}
            name={plan.name}
            description={plan.description}
            features={plan.features}
            price={formatMembershipPrice(plan.price, plan.currency)}
            period={`/ ${plan.durationDays}j`}
            priceNote={
              stripeCurrencyUnsupported
                ? `Stripe ne prend pas en charge cette offre en ${plan.currency}.`
                : `soit ~${formatMembershipPrice(monthlyEquivalent(plan.price, plan.durationDays), plan.currency)} / mois`
            }
            highlighted={isFeatured && !blocked}
            badge="Meilleur prix"
            current={isCurrent}
            action={{
              onClick: () => onSelect(plan),
              disabled: blocked,
              label: isCurrent
                ? "Plan actuel"
                : hasPendingOrActive
                ? "Abonnement en cours"
                : stripeCurrencyUnsupported
                ? "Paiement en ligne indisponible"
                : "Souscrire",
            }}
          />
        );
      })}
    </PlanRowList>
  );
}
