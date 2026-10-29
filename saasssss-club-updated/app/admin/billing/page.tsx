"use client";

import ManualPaymentForm from "@/components/billing/ManualPaymentForm";
import { useEffect, useState, useCallback } from "react";
import { Loader2, CreditCard, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { useDaysUntil } from "@/hooks/useDaysUntil";
import CountrySelect from "@/components/payments/CountrySelect";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import { planFeatureLines } from "@/lib/saas-plan-features";
import BillingPeriodToggle from "@/components/billing/BillingPeriodToggle";
import {
  BILLING_PERIOD_LABEL, BILLING_PERIOD_SUFFIX, planPrice, yearlySavingsPercent, type BillingPeriod,
} from "@/lib/billing-period";

interface BillingStatus {
  club: { status: string; trialEndsAt: string | null } | null;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    trialStartedAt?: string | null;
    currentPeriodEnd: string | null;
    billingPeriod?: BillingPeriod;
    autoRenew?: boolean;
    cancelAtPeriodEnd?: boolean;
    plan: { id: string; tier: string; name: string; priceMonthly: number; priceYearly: number | null; currency: string; limits: Record<string, unknown> };
  } | null;
  usage: { members: number; coaches: number; admins: number; bookingsThisMonth: number };
  limits: Record<string, unknown> | null;
  recentPayments: { id: string; amount: number; currency: string; status: string; billingPeriod?: BillingPeriod; paidAt: string | null; createdAt: string }[];
  openRequest?: { id: string; planId: string; billingPeriod: BillingPeriod; amount: number; currency: string; status: "PENDING" | "APPROVED"; createdAt: string } | null;
}

interface SaasPlan {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  priceYearly: number | null;
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
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Stripe-hosted page: update the card or cancel auto-renewal.
  const openPortal = async () => {
    setPortalBusy(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) { window.location.href = json.url; return; }
      setPortalError(json.error ?? "Impossible d'ouvrir la gestion de l'abonnement.");
    } finally {
      setPortalBusy(false);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [confirmPlan, setConfirmPlan] = useState<SaasPlan | null>(null);
  const [manualPlan, setManualPlan] = useState<SaasPlan | null>(null);
  const [detectedCountry, setDetectedCountry] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>("MONTHLY");
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

  const yearlyAvailable = plans.some((p) => planPrice(p, "YEARLY") !== null);
  const bestSavings = Math.max(0, ...plans.map((p) => yearlySavingsPercent(p)));
  const confirmPrice = confirmPlan ? planPrice(confirmPlan, period) : null;
  const trialDaysLeft = useDaysUntil(data?.subscription?.trialEndsAt ?? null);
  const isTrial = data?.subscription?.status === "TRIALING";

  const confirmUpgrade = async () => {
    if (!confirmPlan) return;
    if (!countryCode) {
      setError("Sélectionnez votre pays avant de continuer.");
      return;
    }
    if (isTunisia) {
      setManualPlan(confirmPlan);
      setConfirmPlan(null);
      return;
    }
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: confirmPlan.id, countryCode, billingPeriod: period }),
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
          Paiement par carte indisponible en Tunisie : choisissez un plan puis payez par virement, D17 ou Flouci.
        </p>
      )}
      {isTrial && data.subscription?.trialEndsAt && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-bold ${
          trialDaysLeft <= 3 ? "border-rose-500/30 bg-rose-500/10 text-rose-500" : "border-amber-500/30 bg-amber-500/10 text-amber-600"
        }`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Période d&apos;essai — {trialDaysLeft} jour{trialDaysLeft !== 1 ? "s" : ""} restant{trialDaysLeft !== 1 ? "s" : ""}
            <span className="block font-semibold opacity-80">
              {data.subscription.trialStartedAt ? `Début : ${new Date(data.subscription.trialStartedAt).toLocaleDateString("fr-FR")} · ` : ""}
              Fin : {new Date(data.subscription.trialEndsAt).toLocaleDateString("fr-FR")} — choisissez un plan ci-dessous pour continuer sans interruption. Vos données sont conservées.
            </span>
          </span>
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
          <>
          <p className="text-sm font-bold text-secondary">
            {data.subscription.status === "ACTIVE" && data.subscription.billingPeriod === "YEARLY" && data.subscription.plan.priceYearly != null
              ? `${data.subscription.plan.priceYearly} ${data.subscription.plan.currency} / an`
              : `${data.subscription.plan.priceMonthly} ${data.subscription.plan.currency} / mois`}
            {data.subscription.status === "ACTIVE" && data.subscription.currentPeriodEnd && (
              <span className="ml-2 text-xs font-semibold text-muted">
                · {BILLING_PERIOD_LABEL[data.subscription.billingPeriod ?? "MONTHLY"]} — {data.subscription.autoRenew ? "renouvelé automatiquement le" : "valable jusqu'au"} {new Date(data.subscription.currentPeriodEnd).toLocaleDateString("fr-FR")}
              </span>
            )}
          </p>
          {data.subscription.status === "ACTIVE" && data.subscription.cancelAtPeriodEnd && (
            <p className="mt-1 text-xs font-semibold text-amber-600">Renouvellement automatique arrêté : l&apos;accès continue jusqu&apos;à la fin de la période payée.</p>
          )}
          {(data.subscription.autoRenew || data.subscription.cancelAtPeriodEnd) && (
            <div className="mt-2">
              <button type="button" onClick={() => void openPortal()} disabled={portalBusy}
                className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-primary disabled:opacity-50">
                {portalBusy ? "Ouverture…" : "Gérer l'abonnement (carte, annulation)"}
              </button>
              {portalError && <p role="alert" className="mt-1 text-xs text-red-600">{portalError}</p>}
            </div>
          )}
          </>
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-primary">Changer de plan</h2>
          <BillingPeriodToggle value={period} onChange={setPeriod} savingsPercent={bestSavings} yearlyAvailable={yearlyAvailable} />
        </div>
        {data.openRequest && (
          <p className="mb-3 rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-700">
            {data.openRequest.status === "APPROVED"
              ? `Votre demande d'abonnement (${BILLING_PERIOD_LABEL[data.openRequest.billingPeriod].toLowerCase()}, ${data.openRequest.amount} ${data.openRequest.currency}) est approuvée : elle sera activée dès que notre équipe aura vérifié le paiement.`
              : `Votre demande d'abonnement (${BILLING_PERIOD_LABEL[data.openRequest.billingPeriod].toLowerCase()}, ${data.openRequest.amount} ${data.openRequest.currency}) est en cours d'examen par notre équipe.`}
          </p>
        )}
        <PlanRowList className="max-w-none">
          {plans.map((plan) => {
            const price = planPrice(plan, period);
            const isCurrent = plan.id === data.subscription?.plan.id && (data.subscription?.billingPeriod ?? "MONTHLY") === period;
            return (
              <PlanRowCard
                key={plan.id}
                eyebrow={plan.tier}
                name={plan.name}
                features={planFeatureLines(plan.limits)}
                price={price === null ? "—" : `${price} ${plan.currency}`}
                period={BILLING_PERIOD_SUFFIX[period]}
                priceNote={period === "YEARLY" && yearlySavingsPercent(plan) > 0 ? `Économisez ${yearlySavingsPercent(plan)} % par rapport au mensuel` : undefined}
                current={isCurrent}
                highlighted={isCurrent}
                badge="Plan actuel"
                action={{
                  onClick: () => setConfirmPlan(plan),
                  disabled: (isCurrent && !isTrial) || upgrading || !countryCode || price === null,
                  label: isCurrent && !isTrial ? (
                    <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Plan actuel</span>
                  ) : price === null ? (
                    "Indisponible pour cette période"
                  ) : isTunisia ? (
                    "Payer (virement / D17 / Flouci)"
                  ) : !countryCode ? (
                    "Choisir un pays"
                  ) : (
                    "Choisir ce plan"
                  ),
                }}
              />
            );
          })}
        </PlanRowList>
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

      {manualPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-sm font-extrabold text-primary">Paiement manuel</h3>
            <ManualPaymentForm
              endpoint="/api/billing/manual-request"
              planId={manualPlan.id}
              billingPeriod={period}
              planLabel={`${manualPlan.name} — ${planPrice(manualPlan, period) ?? "—"} ${manualPlan.currency} ${BILLING_PERIOD_SUFFIX[period]}`}
            />
            <button onClick={() => { setManualPlan(null); void load(); }} className="w-full rounded-full border border-border py-2 text-xs font-bold text-primary">
              Fermer
            </button>
          </div>
        </div>
      )}

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
                ? `Plan ${confirmPlan.name} — ${confirmPrice ?? "—"} ${confirmPlan.currency} ${BILLING_PERIOD_SUFFIX[period]}. Vous allez envoyer une demande (virement, D17, Flouci ou espèces) ; elle est examinée par notre équipe avant toute activation.`
                : `Payer ${confirmPrice ?? "—"} ${confirmPlan.currency} ${BILLING_PERIOD_SUFFIX[period]} (facturation ${BILLING_PERIOD_LABEL[period].toLowerCase()}) pour le plan ${confirmPlan.name} ? Vous serez redirigé vers le paiement sécurisé Stripe ; l'abonnement est activé uniquement après confirmation du paiement.`}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmPlan(null)}
                disabled={upgrading}
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
