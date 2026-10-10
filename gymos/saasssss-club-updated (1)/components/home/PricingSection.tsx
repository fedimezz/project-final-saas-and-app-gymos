"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, Zap, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";

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
        const res = await fetch("/api/plans/public", { cache: "no-store" });
        const data = await res.json();
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
  const gridCols =
    plans.length === 1
      ? "max-w-md mx-auto"
      : plans.length === 2
      ? "md:grid-cols-2 max-w-3xl mx-auto"
      : "md:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="theme-section relative py-28 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-4 md:px-6 relative z-10 max-w-6xl">
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Tarifs & Offres</span>
          </div>
          <h2 className="theme-heading text-3xl sm:text-5xl text-[var(--text-primary)]">
            Choisissez la formule d&apos;exception
          </h2>
        </div>

        <div className={`grid gap-8 items-stretch ${gridCols}`}>
          {plans.map((plan, i) => {
            const popular = i === popularIndex;
            const Icon = ICONS[i % ICONS.length];
            return (
              <div
                key={plan.id}
                className={`theme-card relative p-8 flex flex-col justify-between transition-all duration-300 transform hover:-translate-y-1 ${
                  popular
                    ? "bg-slate-900 text-white border-2 border-emerald-500 shadow-2xl shadow-emerald-500/20 scale-[1.03]"
                    : "bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-xl backdrop-blur-md"
                }`}
              >
                {popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-extrabold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 fill-slate-950" />
                    <span>Offre la plus prisée</span>
                  </div>
                )}

                <div>
                  <div className={`inline-flex p-3 rounded-2xl ${popular ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-500/10 text-emerald-500"}`}>
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mt-6 text-2xl font-black tracking-tight">{plan.name}</h3>
                  {plan.description && (
                    <p className={`text-xs mt-2 font-medium leading-relaxed ${popular ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                      {plan.description}
                    </p>
                  )}

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black tracking-tight">{formatMembershipPrice(plan.price, plan.currency)}</span>
                    <span className={`text-xs font-semibold ${popular ? "text-slate-400" : "text-slate-500"}`}>
                      {periodLabel(plan.durationDays)}
                    </span>
                  </div>

                  {plan.features.length > 0 && (
                    <>
                      <div className="my-8 border-t border-slate-200/20 dark:border-slate-800" />
                      <ul className="space-y-3.5 text-xs font-medium">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <div className={`mt-0.5 p-1 rounded-full flex-shrink-0 ${popular ? "bg-emerald-400 text-slate-950" : "bg-emerald-500/20 text-emerald-400"}`}>
                              <Check className="h-3 w-3 stroke-[3]" />
                            </div>
                            <span className={popular ? "text-slate-200" : "text-slate-700 dark:text-slate-300"}>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <Link
                  href={isLoggedIn ? "/dashboard/membership" : "/user/register"}
                  className={`mt-10 w-full rounded-2xl py-3.5 font-extrabold text-xs tracking-wider uppercase transition duration-300 text-center block shadow-lg active:scale-95 ${
                    popular
                      ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30"
                      : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-700/50"
                  }`}
                >
                  {isLoggedIn ? "Voir mon abonnement" : "Sélectionner cette formule"}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
