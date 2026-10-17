"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/fetch-api";
import { Loader2, RefreshCw } from "lucide-react";

import MembershipCardDisplay from "@/components/membership/MembershipCardDisplay";
import ActiveSubscriptionCard from "@/components/membership/ActiveSubscriptionCard";
import PlansList from "@/components/membership/PlansList";
import SubscribeModal from "@/components/membership/SubscribeModal";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

interface MembershipData {
  card: {
    cardNumber: string;
    isActive: boolean;
    expiresAt: string | null;
  } | null;
  activeSubscription: {
    id: string;
    endDate: string;
    status: string;
    plan: { id: string; name: string; price: number; currency: string };
    payments: { status: string; paymentMethod: string }[];
  } | null;
  plans: Plan[];
  history: unknown[];
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm
        ${
          type === "success"
            ? "bg-card border-green-500/30 text-green-600 dark:text-green-400"
            : "bg-card border-red-500/30 text-red-600 dark:text-red-400"
        }`}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Fermer la notification"
      >
        ✕
      </button>
    </div>
  );
}

export default function MembershipPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<MembershipData | null>(null);
  const [detectedCountry, setDetectedCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [resuming, setResuming] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);
  const countryCode = selectedCountry ?? detectedCountry;

  useEffect(() => {
    let active = true;
    fetch("/api/payments/country", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Country detection request failed");
        const result = await response.json() as { countryCode?: string | null };
        if (active && typeof result.countryCode === "string") setDetectedCountry(result.countryCode);
      })
      .catch(() => {
        if (active) {
          setDetectedCountry("");
          showToast("Pays non détecté automatiquement. Sélectionnez-le manuellement avant le paiement.", "error");
        }
      });
    return () => { active = false; };
  }, [showToast]);

  const fetchMembership = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await apiFetch("/api/dashboard/membership", {});
        const json = await res.json();

        if (res.ok) {
          setData(json);
        } else {
          showToast(json.error || "Erreur de chargement", "error");
        }
      } catch {
        showToast("Erreur serveur", "error");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchMembership(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe's return URL is only informational; the signed webhook activates payment.
  useEffect(() => {
    const status = searchParams.get("payment");
    if (!status) return;

    if (status === "success") {
      showToast("Paiement transmis. La confirmation du serveur peut prendre quelques instants.", "success");
    } else if (status === "pending") {
      showToast("Paiement en cours de traitement. Actualisez dans un instant.", "success");
    } else if (status === "failed") {
      showToast("Le paiement a échoué. Vous pouvez réessayer ci-dessous.", "error");
    } else if (status === "error") {
      showToast("Une erreur est survenue lors de la vérification du paiement.", "error");
    } else if (status === "cancelled") {
      showToast("Paiement annulé. Votre demande reste en attente.", "error");
    }

    fetchMembership(false);
    // Strip the query param so a refresh doesn't re-fire the toast.
    router.replace("/dashboard/membership");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Arriving from the public /offres page with ?planId=... — open the
  // subscribe modal for that plan directly instead of making the member
  // hunt for it again in the list below.
  useEffect(() => {
    const planId = searchParams.get("planId");
    if (!planId || !data) return;
    const plan = data.plans.find((p) => p.id === planId);
    if (plan) setSelectedPlan(plan);
    router.replace("/dashboard/membership");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data]);

  const handleSubscribe = async (
    planId: string,
    paymentMethod: "ONLINE" | "ONSITE",
    countryCodeForPayment: string
  ): Promise<{ ok: boolean; paymentUrl?: string }> => {
    try {
      const res = await apiFetch("/api/dashboard/membership/subscribe", {
        method: "POST",
        body: JSON.stringify({ planId, paymentMethod, countryCode: countryCodeForPayment }),
      });
      const json = await res.json();

      if (res.ok) {
        if (paymentMethod === "ONSITE") {
          showToast(json.message || "Demande enregistrée", "success");
          fetchMembership(false);
        }
        return { ok: true, paymentUrl: json.paymentUrl };
      } else {
        showToast(json.error || "Erreur lors de la souscription", "error");
        return { ok: false };
      }
    } catch {
      showToast("Erreur serveur", "error");
      return { ok: false };
    }
  };

  const handleResumePayment = async () => {
    setResuming(true);
    try {
      const res = await apiFetch("/api/dashboard/membership/resume-payment", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.paymentUrl) {
        window.location.href = json.paymentUrl;
      } else {
        showToast(json.error || "Impossible de relancer le paiement", "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setResuming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement de votre adhésion...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted">Impossible de charger les données.</p>
        <button
          onClick={() => fetchMembership(true)}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const hasPendingOrActive = !!data.activeSubscription;
  const isPendingOnline =
    data.activeSubscription?.status === "PENDING" &&
    data.activeSubscription.payments[0]?.paymentMethod === "ONLINE";

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">Adhésion</h1>
          <p className="mt-1 text-muted">Votre carte, votre abonnement et nos plans.</p>
        </div>
        <button
          onClick={() => fetchMembership(false)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-muted hover:bg-muted/70 rounded-xl transition-colors disabled:opacity-50 font-medium self-start sm:self-auto"
        >
          {isRefreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {isRefreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <MembershipCardDisplay card={data.card} />
        <ActiveSubscriptionCard
          subscription={data.activeSubscription}
          onResumePayment={isPendingOnline ? handleResumePayment : undefined}
          resuming={resuming}
        />
      </div>

      <div>
        <h2 className="text-xl font-bold text-primary mb-4">Nos plans</h2>
        <PlansList
          plans={data.plans}
          countryCode={countryCode}
          currentPlanId={data.activeSubscription?.plan.id}
          hasPendingOrActive={hasPendingOrActive}
          onSelect={setSelectedPlan}
        />
      </div>

      {selectedPlan && (
        <SubscribeModal
          plan={selectedPlan}
          countryCode={countryCode}
          onCountryChange={setSelectedCountry}
          onClose={() => setSelectedPlan(null)}
          onSubscribe={handleSubscribe}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
