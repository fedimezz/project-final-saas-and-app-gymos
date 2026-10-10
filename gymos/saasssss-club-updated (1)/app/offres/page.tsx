"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import PagePublishGate from "@/components/layout/PagePublishGate";
import PromotionsSection from "@/components/public/PromotionsSection";
import { useEditableContent } from "@/hooks/useEditableContent";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

function monthlyEquivalent(price: number, durationDays: number) {
  const months = durationDays / 30;
  return Math.round((price / months) * 100) / 100;
}

function PlanCard({
  plan,
  ctaLabel,
  ctaHref,
  isDarkMode,
  highlighted,
  delay,
}: {
  plan: Plan;
  ctaLabel: string;
  ctaHref: string;
  isDarkMode: boolean;
  highlighted?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`rounded-2xl p-8 shadow-lg flex flex-col ${
        highlighted
          ? "bg-green-600 text-white scale-105"
          : isDarkMode
          ? "bg-neutral-900 text-white"
          : "bg-white text-gray-900"
      }`}
    >
      <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
      <p className={`text-3xl font-extrabold mb-1 ${highlighted ? "text-white" : "text-green-600"}`}>
        {formatMembershipPrice(plan.price, plan.currency)}
      </p>
      <p className={`text-xs mb-4 ${highlighted ? "text-white/80" : isDarkMode ? "text-neutral-500" : "text-gray-500"}`}>
        soit ~{formatMembershipPrice(monthlyEquivalent(plan.price, plan.durationDays), plan.currency)} / mois · {plan.durationDays} jours
      </p>
      {plan.features.length > 0 && (
        <ul className="mb-6 flex-1 space-y-2">
          {plan.features.map((f, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 text-sm leading-relaxed ${
                highlighted ? "text-white/90" : isDarkMode ? "text-neutral-400" : "text-gray-600"
              }`}
            >
              <Check size={16} className="mt-0.5 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
      {plan.description && (
        <p
          className={`text-sm leading-relaxed mb-6 ${plan.features.length > 0 ? "" : "flex-1"} ${
            highlighted ? "text-white/90" : isDarkMode ? "text-neutral-400" : "text-gray-600"
          }`}
        >
          {plan.description}
        </p>
      )}
      <a
        href={ctaHref}
        className={`flex items-center justify-center gap-2 py-2.5 rounded-full font-semibold transition ${
          highlighted
            ? "bg-white text-green-700 hover:bg-gray-100"
            : "bg-green-600 text-white hover:bg-green-700"
        }`}
      >
        <Check size={16} />
        {ctaLabel}
      </a>
    </motion.div>
  );
}

export default function OffresPage() {
  // Shared with the rest of the app (context/ThemeContext.tsx) instead of a
  // second, redundant localStorage read + MutationObserver on <html> — this
  // page used to duplicate that logic locally.
  const { isDark: isDarkMode } = useTheme();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const { t, img } = useEditableContent("offres");
  const { isLoggedIn } = useAuth();
  const heroImage = img("heroImage", "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plans/public");
        const data = await res.json();
        if (!cancelled) setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch {
        if (!cancelled) setPlansError(true);
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ctaLabel = t("ctaLabel", "Choisir cette offre");
  // Best price-per-month plan gets the highlighted "featured" card, same
  // rule as the logged-in PlansList so the two views stay consistent.
  const featuredId =
    plans.length > 0
      ? plans.reduce((best, p) =>
          monthlyEquivalent(p.price, p.durationDays) < monthlyEquivalent(best.price, best.durationDays) ? p : best
        , plans[0]).id
      : null;

  // Logged-in members already have a real subscribe flow on the dashboard
  // (with a modal + payment tracking) — send them there with the plan
  // preselected. Guests go register first, then land on that same page.
  const ctaHref = (planId: string) => (isLoggedIn ? `/dashboard/membership?planId=${planId}` : "/user/register");

  return (
    <PagePublishGate pageKey="offres">
      <div className={`min-h-screen transition-all duration-300 ${isDarkMode ? "bg-neutral-950" : "bg-gradient-to-b from-gray-50 to-white"}`}>
        <section className={`relative py-16 text-center ${heroImage ? "overflow-hidden" : ""}`}>
          {heroImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/55" />
            </>
          )}
          <div className="relative container mx-auto px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <h1 className={`text-5xl md:text-6xl font-bold mb-5 ${heroImage ? "text-white" : isDarkMode ? "text-white" : "text-gray-900"}`}>
                {t("heroTitle", "Nos offres d'adhésion")}
              </h1>
              <p className={`text-xl max-w-2xl mx-auto leading-relaxed ${heroImage ? "text-white/90" : isDarkMode ? "text-neutral-400" : "text-gray-600"}`}>
                {t("heroSubtitle", "Un abonnement pour chaque besoin, sans engagement caché.")}
              </p>
            </motion.div>
          </div>
        </section>

        <section className="py-12">
          <div className="container mx-auto px-4">
            {loadingPlans ? (
              <div className="flex justify-center py-16">
                <Loader2 size={32} className="animate-spin text-green-600" />
              </div>
            ) : plansError || plans.length === 0 ? (
              <p className={`text-center ${isDarkMode ? "text-neutral-400" : "text-gray-600"}`}>
                Nos offres seront bientôt disponibles ici — contactez-nous en attendant.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start max-w-5xl mx-auto">
                {plans.map((plan, i) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    ctaLabel={ctaLabel}
                    ctaHref={ctaHref(plan.id)}
                    isDarkMode={isDarkMode}
                    highlighted={plan.id === featuredId && plans.length > 1}
                    delay={i * 0.1}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Promotional offers the club published (renders nothing if none). */}
        <PromotionsSection className="pb-16" />
      </div>
    </PagePublishGate>
  );
}
