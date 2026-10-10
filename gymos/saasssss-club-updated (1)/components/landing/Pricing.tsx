"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

interface SaasPlan {
  id: string;
  tier: "STARTER" | "PRO" | "BUSINESS";
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
}

const TIER_HIGHLIGHT: Record<string, boolean> = { PRO: true };

const LIMIT_LABELS: { key: string; label: string }[] = [
  { key: "maxMembers", label: "membres" },
  { key: "maxCoaches", label: "coachs" },
  { key: "maxAdmins", label: "administrateurs" },
  { key: "maxBookingsPerMonth", label: "réservations / mois" },
];

const FEATURE_FLAGS: { key: string; label: string }[] = [
  { key: "customDomain", label: "Domaine personnalisé" },
  { key: "advancedAnalytics", label: "Analytique avancée" },
  { key: "revenueAnalytics", label: "Analytique des revenus" },
  { key: "apiAccess", label: "Accès API" },
  { key: "whiteLabel", label: "Marque blanche" },
];

function formatLimit(value: unknown): string {
  if (value === null || value === undefined) return "Illimité";
  return String(value);
}

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

          {/* Monthly/annual toggle — front-end display only (×10 = 2 months
              free, a common convention). Annual billing isn't wired up in
              the billing backend yet (that's Phase 9), so this is presentational. */}
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-card p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${!annual ? "bg-emerald-500 text-slate-950" : "text-secondary"}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${annual ? "bg-emerald-500 text-slate-950" : "text-secondary"}`}
            >
              Annuel
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-500">
                2 mois offerts
              </span>
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
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const highlighted = TIER_HIGHLIGHT[plan.tier];
              const price = annual ? Math.round(plan.priceMonthly * 10) : plan.priceMonthly;

              return (
                <motion.div
                  key={plan.id}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className={`relative flex flex-col rounded-2xl border p-7 ${
                    highlighted
                      ? "border-emerald-500/50 bg-card shadow-2xl shadow-emerald-500/10 lg:-translate-y-3"
                      : "border-border bg-card shadow-sm"
                  }`}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-black text-slate-950">
                      Le plus populaire
                    </span>
                  )}

                  <p className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">{plan.tier}</p>
                  <h3 className="mt-1 text-xl font-black text-primary">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-primary">{price} {plan.currency}</span>
                    <span className="text-xs font-semibold text-muted">/ {annual ? "an" : "mois"}</span>
                  </div>

                  <Link href="/onboarding" className="mt-6">
                    <button
                      className={`w-full rounded-full py-2.5 text-xs font-extrabold transition active:scale-95 ${
                        highlighted
                          ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25 hover:bg-emerald-400"
                          : "border border-border text-primary hover:border-[var(--primary)]/40"
                      }`}
                    >
                      Choisir {plan.name}
                    </button>
                  </Link>

                  <ul className="mt-7 space-y-2.5 border-t border-border pt-6 text-xs">
                    {LIMIT_LABELS.map(({ key, label }) => (
                      <li key={key} className="flex items-center gap-2 text-secondary">
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                        <span className="font-bold text-primary">{formatLimit(plan.limits[key])}</span> {label}
                      </li>
                    ))}
                    {FEATURE_FLAGS.filter((f) => plan.limits[f.key] === true).map((f) => (
                      <li key={f.key} className="flex items-center gap-2 text-secondary">
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                        {f.label}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
