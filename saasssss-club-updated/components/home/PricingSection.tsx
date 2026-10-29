"use client";

import { useEffect, useState } from "react";
import { Sparkles, Zap, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import { fetchPublicJson } from "@/lib/public-fetch";

interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

const ICONS = [Zap, Sparkles, Crown];

function periodLabel(days: number): string {
  if (days === 30) return "/mois";
  if (days === 90) return "/trimestre";
  if (days === 180) return "/semestre";
  if (days === 365) return "/an";
  return `/ ${days} jours`;
}

// Only the formulas the OWNER created (Admin → Formules). Nothing is shown —
// and no fake "Basic / Premium / VIP" cards — until at least one active plan exists.
export default function PricingSection() {
  const { isLoggedIn } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPublicJson<{ plans?: unknown }>("/api/plans/public");
        if (!cancelled) setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch {
        // section simply stays hidden
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || plans.length === 0) return null;

  // Highlight the middle plan only when there are 3+ to compare.
  const popularIndex = plans.length >= 3 ? 1 : -1;

  return (
    <section className="theme-section relative overflow-hidden py-20 sm:py-28">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[150px]" />

      <div className="container relative z-10 mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tarifs & Offres</span>
          </div>
          <h2 className="theme-heading text-3xl text-[var(--text-primary)] sm:text-5xl">
            Choisissez la formule d&apos;exception
          </h2>
        </div>

        <PlanRowList>
          {plans.map((plan, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <PlanRowCard
                key={plan.id}
                name={plan.name}
                description={plan.description}
                features={plan.features}
                price={formatMembershipPrice(plan.price, plan.currency)}
                period={periodLabel(plan.durationDays)}
                highlighted={i === popularIndex}
                badge="Offre la plus prisée"
                icon={<Icon className="h-6 w-6" />}
                action={{
                  href: isLoggedIn ? "/dashboard/membership" : "/user/register",
                  label: isLoggedIn ? "Voir mon abonnement" : "Sélectionner cette formule",
                }}
              />
            );
          })}
        </PlanRowList>
      </div>
    </section>
  );
}
