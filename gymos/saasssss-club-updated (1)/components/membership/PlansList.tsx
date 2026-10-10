"use client";

import { Check, Sparkles } from "lucide-react";
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

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        const isFeatured = plan.id === featuredId && plans.length > 1;
        const isInternational = !!countryCode && countryCode !== "TN";
        const stripeCurrencyUnsupported = isInternational && !canStripeChargeMembershipCurrency(plan.currency);

        return (
          <div
            key={plan.id}
            className={`relative bg-card border rounded-2xl p-6 flex flex-col transition-all hover:shadow-md ${
              isFeatured ? "border-[var(--primary)] ring-1 ring-[var(--primary)]/30" : "border-border"
            }`}
          >
            {isFeatured && (
              <span className="absolute -top-3 left-6 px-3 py-1 bg-[var(--primary)] text-white text-xs font-semibold rounded-full flex items-center gap-1">
                <Sparkles size={11} />
                Meilleur prix
              </span>
            )}

            <h3 className="font-bold text-lg text-primary">{plan.name}</h3>
            {plan.description && (
              <p className="text-sm text-muted mt-1">{plan.description}</p>
            )}

            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-primary">
                {formatMembershipPrice(plan.price, plan.currency)}
              </span>
              <span className="text-sm text-muted">/ {plan.durationDays}j</span>
            </div>
            <p className="text-xs text-muted mt-1">
              {stripeCurrencyUnsupported
                ? `Stripe ne prend pas en charge cette offre en ${plan.currency}.`
                : `soit ~${formatMembershipPrice(monthlyEquivalent(plan.price, plan.durationDays), plan.currency)} / mois`}
            </p>

            {plan.features.length > 0 && (
              <ul className="mt-5 space-y-2 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-secondary">
                    <Check size={15} className="text-success flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => onSelect(plan)}
              disabled={isCurrent || hasPendingOrActive || stripeCurrencyUnsupported}
              className={`mt-6 w-full py-2.5 rounded-xl font-medium transition-colors ${
                isCurrent
                  ? "bg-muted text-muted cursor-not-allowed"
                  : hasPendingOrActive
                  ? "bg-muted text-muted cursor-not-allowed"
                  : isFeatured
                  ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
                  : "bg-muted text-primary hover:bg-[var(--primary)]/10 border border-border"
              }`}
            >
              {isCurrent
                ? "Plan actuel"
                : hasPendingOrActive
                ? "Abonnement en cours"
                : stripeCurrencyUnsupported
                ? "Paiement en ligne indisponible"
                : "Souscrire"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
