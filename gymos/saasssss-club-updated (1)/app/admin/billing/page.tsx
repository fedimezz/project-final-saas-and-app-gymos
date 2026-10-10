"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { useDaysUntil } from "@/hooks/useDaysUntil";
import CountrySelect from "@/components/payments/CountrySelect";

interface BillingStatus {
  club: { status: string; trialEndsAt: string | null } | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: { id: string; tier: string; name: string; priceMonthly: number; currency: string; limits: Record<string, unknown> };
  } | null;
  usage: { members: number; coaches: number; admins: number; bookingsThisMonth: number };
  limits: Record<string, unknown> | null;
  recentPayments: { id: string; amount: number; currency: string; status: string; paidAt: string | null; createdAt: string }[];
}

interface SaasPlan {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
}

const USAGE_ROWS: { key: keyof BillingStatus["usage"]; limitKey: string; label: string }[] = [
  { key: "members", limitKey: "maxMembers", label: "Membres" },
  { key: "coaches", limitKey: "maxCoaches", label: "Coachs" },
  { key: "admins", limitKey: "maxAdmins", label: "Administrateurs" },
  { key: "bookingsThisMonth", limitKey: "maxBookingsPerMonth", label: "Réservations ce mois" },
];

function numericLimit(limits: Record<string, unknown> | null, key: string): number | null {
  if (!limits) return 0;
  const v = limits[key];
  if (v === null || v === undefined) return null; // unlimited
  return typeof v === "number" ? v : 0;
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-secondary">
        <span>{label}</span>
        <span className={pct >= 90 ? "font-bold text-rose-500" : "font-semibold"}>
          {used} / {limit === null ? "∞" : limit}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<SaasPlan | null>(null);
  const [detectedCountry, setDetectedCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const countryCode = selectedCountry ?? detectedCountry;
  const isTunisia = countryCode === "TN";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, plansRes, countryRes] = await Promise.all([
        fetch("/api/billing/status"),
        fetch("/api/saas-plans"),
        fetch("/api/payments/country", { cache: "no-store" }),
      ]);
      if (statusRes.ok) setData(await statusRes.json());
      if (plansRes.ok) setPlans((await plansRes.json()).plans);
      if (countryRes.ok) {
        const country = await countryRes.json() as { countryCode?: string | null };
        setDetectedCountry(country.countryCode ?? "");
      }
    } catch {
      setError("Impossible de charger les informations de facturation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const trialDaysLeft = useDaysUntil(data?.subscription?.trialEndsAt ?? null);
  const isTrial = data?.subscription?.status === "TRIALING";

  const confirmUpgrade = async () => {
    if (!confirmPlan) return;
    if (!countryCode) {
      setError("Sélectionnez votre pays avant de continuer.");
      return;
    }
    if (isTunisia) {
      setError("La facturation SaaS en ligne n'est pas disponible en Tunisie. Contactez le support GymOS.");
      return;
    }
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: confirmPlan.id, countryCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur lors du changement de plan");
        return;
      }
      if (typeof json.paymentUrl !== "string") {
        setError("Stripe n'a pas retourné de lien de paiement valide.");
        return;
      }
      window.location.assign(json.paymentUrl);
    } catch {
      setError("Impossible de créer la session de paiement.");
    } finally {
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!data) return <p className="text-sm text-rose-500">Impossible de charger les informations de facturation.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-black text-primary">Facturation & plan</h1>
        <p className="text-xs text-muted">Gérez votre abonnement SaaS et suivez votre utilisation.</p>
      </div>

      <CountrySelect value={countryCode} onChange={setSelectedCountry} />
      {isTunisia && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700">
          La facturation SaaS en ligne n&apos;est pas disponible en Tunisie. Contactez le support GymOS.
        </p>
      )}
      {isTrial && data.subscription?.trialEndsAt && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-bold ${
          trialDaysLeft <= 3 ? "border-rose-500/30 bg-rose-500/10 text-rose-500" : "border-amber-500/30 bg-amber-500/10 text-amber-600"
        }`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Période d&apos;essai — {trialDaysLeft} jour{trialDaysLeft !== 1 ? "s" : ""} restant{trialDaysLeft !== 1 ? "s" : ""}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">{error}</p>
      )}

      {/* Current plan card */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-500">
              {data.subscription?.plan.tier ?? "Aucun plan"}
            </span>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-500">
            {data.subscription?.status ?? "—"}
          </span>
        </div>
        <p className="mt-1 text-lg font-black text-primary">{data.subscription?.plan.name ?? "—"}</p>
        {data.subscription && (
          <p className="text-sm font-bold text-secondary">
            {data.subscription.plan.priceMonthly} {data.subscription.plan.currency} / mois
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {USAGE_ROWS.map((row) => (
            <UsageBar
              key={row.key}
              label={row.label}
              used={data.usage[row.key]}
              limit={numericLimit(data.limits, row.limitKey)}
            />
          ))}
        </div>
      </div>

      {/* Plan picker */}
      <div>
        <h2 className="mb-3 text-sm font-extrabold text-primary">Changer de plan</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === data.subscription?.plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 ${isCurrent ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card"}`}
              >
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">{plan.tier}</p>
                <p className="mt-1 text-sm font-black text-primary">{plan.name}</p>
                <p className="mt-2 text-lg font-black text-primary">
                  {plan.priceMonthly} {plan.currency}
                  <span className="text-[10px] font-semibold text-muted"> /mois</span>
                </p>
                <button
                  disabled={isCurrent || upgrading || !countryCode || isTunisia}
                  onClick={() => setConfirmPlan(plan)}
                  className={`mt-4 w-full rounded-full py-2 text-xs font-extrabold transition disabled:opacity-40 ${
                    isCurrent ? "bg-emerald-500/20 text-emerald-500" : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  }`}
                >
                  {isCurrent ? (
                    <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Plan actuel</span>
                  ) : isTunisia ? (
                    "Indisponible en Tunisie"
                  ) : !countryCode ? (
                    "Choisir un pays"
                  ) : (
                    "Choisir ce plan"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment history */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-extrabold text-primary">Historique des paiements</h2>
        </div>
        {data.recentPayments.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted">
            Aucun paiement enregistré pour le moment.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {data.recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 text-xs">
                <div>
                  <p className="font-bold text-primary">{p.amount} {p.currency}</p>
                  <p className="text-[10px] text-muted">
                    {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  p.status === "PAID" ? "bg-emerald-500/10 text-emerald-500" :
                  p.status === "FAILED" ? "bg-rose-500/10 text-rose-500" :
                  "bg-amber-500/10 text-amber-600"
                }`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-extrabold text-primary">Confirmer le changement de plan</h3>
            </div>
            <p className="mt-3 text-xs text-secondary">
              {isTunisia
                ? "La facturation SaaS en ligne n'est pas disponible en Tunisie. Contactez le support GymOS."
                : `Payer ${confirmPlan.priceMonthly} ${confirmPlan.currency}/mois pour passer au plan ${confirmPlan.name} ?`}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmPlan(null)}
                disabled={upgrading || !countryCode || isTunisia}
                className="flex-1 rounded-full border border-border py-2 text-xs font-bold text-primary disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmUpgrade}
                disabled={upgrading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-500 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50"
              >
                {upgrading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
