"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import { planFeatureLines } from "@/lib/saas-plan-features";
import { planPrice, yearlySavingsPercent } from "@/lib/billing-period";

interface SaasPlan {
  id: string;
  tier: "STARTER" | "PRO" | "BUSINESS";
  name: string;
  priceMonthly: number;
  priceYearly?: number | null;
  currency: string;
  limits: Record<string, unknown>;
}

const TIER_HIGHLIGHT: Record<string, boolean> = { PRO: true };

export default function Pricing() {
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/saas-plans");
        if (res.ok) {
          const json = await res.json();
          if (active) setPlans(json.plans ?? []);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const bestSavings = Math.max(0, ...plans.map((p) => yearlySavingsPercent(p)));

  return (
    <section id="pricing" className="section-padding scroll-mt-24 bg-muted/40">
      <div className="container-custom">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Tarifs</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Un tarif simple, qui grandit avec vous.
          </h2>
          <p className="mt-4 text-sm text-secondary sm:text-base">
            Commencez gratuitement pendant votre essai, puis choisissez le plan adapté à la taille de votre club.
          </p>

          {/* Monthly/annual toggle — prices come from SaasPlan.priceMonthly / priceYearly (editable in
              /platform/plans) and are the same ones charged at checkout. */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${!annual ? "bg-emerald-500 text-[color:var(--mono-on-accent)]" : "text-secondary"}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${annual ? "bg-emerald-500 text-[color:var(--mono-on-accent)]" : "text-secondary"}`}
            >
              Annuel
              {bestSavings > 0 && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-500">
                  -{bestSavings}%
                </span>
              )}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
          </div>
        ) : plans.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted">Les plans seront bientôt disponibles.</p>
        ) : (
          <PlanRowList className="mt-14">
            {plans.map((plan, i) => {
              const highlighted = TIER_HIGHLIGHT[plan.tier];
              const price = planPrice(plan, annual ? "YEARLY" : "MONTHLY");
              return (
                <motion.div
                  key={plan.id}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <PlanRowCard
                    eyebrow={plan.tier}
                    name={plan.name}
                    features={planFeatureLines(plan.limits)}
                    price={price === null ? "—" : `${price} ${plan.currency}`}
                    priceNote={annual && price === null ? "Facturation annuelle non proposée" : undefined}
                    period={`/ ${annual ? "an" : "mois"}`}
                    highlighted={highlighted}
                    badge="Le plus populaire"
                    action={{ href: "/onboarding", label: `Choisir ${plan.name}` }}
                  />
                </motion.div>
              );
            })}
          </PlanRowList>
        )}
      </div>
    </section>
  );
}
