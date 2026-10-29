"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import PagePublishGate from "@/components/layout/PagePublishGate";
import PromotionsSection from "@/components/public/PromotionsSection";
import { useEditableContent } from "@/hooks/useEditableContent";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";

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
              <PlanRowList>
                {plans.map((plan) => (
                  <PlanRowCard
                    key={plan.id}
                    name={plan.name}
                    description={plan.description}
                    features={plan.features}
                    price={formatMembershipPrice(plan.price, plan.currency)}
                    period={`/ ${plan.durationDays} jours`}
                    priceNote={`soit ~${formatMembershipPrice(monthlyEquivalent(plan.price, plan.durationDays), plan.currency)} / mois`}
                    highlighted={plan.id === featuredId && plans.length > 1}
                    badge="Meilleur prix"
                    action={{ href: ctaHref(plan.id), label: ctaLabel }}
                  />
                ))}
              </PlanRowList>
            )}
          </div>
        </section>

        {/* Promotional offers the club published (renders nothing if none). */}
        <PromotionsSection className="pb-16" />
      </div>
    </PagePublishGate>
  );
}
