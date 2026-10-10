"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Pencil, Save, Users2, X } from "lucide-react";

interface Plan {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
  isActive: boolean;
  subscriberCount: number;
}

function formatLimit(v: unknown) {
  if (v === null || v === undefined) return "Illimité";
  if (typeof v === "boolean") return v ? "Oui" : "Non";
  return String(v);
}

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [name, setName] = useState("");
  const [priceMonthly, setPriceMonthly] = useState("");
  const [limitsJson, setLimitsJson] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = (plan: Plan) => {
    setEditing(plan);
    setName(plan.name);
    setPriceMonthly(String(plan.priceMonthly));
    setLimitsJson(JSON.stringify(plan.limits, null, 2));
    setIsActive(plan.isActive);
    setError(null);
  };

  const savePlan = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setError(null);
    try {
      let limits: unknown;
      try {
        limits = JSON.parse(limitsJson);
      } catch {
        setError("Les limites doivent être un JSON valide.");
        return;
      }
      const response = await fetch("/api/platform/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name,
          priceMonthly: Number(priceMonthly),
          currency: "USD",
          limits,
          isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Impossible d'enregistrer le plan.");
        return;
      }
      setPlans((current) => current.map((plan) =>
        plan.id === editing.id ? { ...plan, ...result.plan } : plan
      ));
      setEditing(null);
    } catch {
      setError("Erreur réseau pendant l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/platform/plans");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Impossible de charger les plans.");
        setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Impossible de charger les plans.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <p className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{loadError}</p>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
        <div key={plan.id} className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">{plan.tier}</span>
            {!plan.isActive && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-500">Inactif</span>
            )}
          </div>
          <h3 className="mt-1 text-lg font-black text-primary">{plan.name}</h3>
          <p className="mt-2 text-2xl font-black text-primary">
            {plan.priceMonthly} {plan.currency}
            <span className="text-xs font-semibold text-muted"> /mois</span>
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs font-bold text-primary">
            <Users2 className="h-4 w-4 text-emerald-500" />
            {plan.subscriberCount} club{plan.subscriberCount !== 1 ? "s" : ""} abonné{plan.subscriberCount !== 1 ? "s" : ""}
          </div>

          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs text-secondary">
            {Object.entries(plan.limits).map(([key, val]) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-muted">{key}</span>
                <span className="font-bold text-primary">{formatLimit(val)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => startEditing(plan)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs font-bold text-primary transition hover:border-[var(--primary)]/50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Modifier le plan
          </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">{editing.tier}</p>
                <h2 className="text-lg font-black text-primary">Modifier le plan</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-secondary">
                Nom
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-secondary">
                  Prix mensuel
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={priceMonthly}
                    onChange={(event) => setPriceMonthly(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary"
                  />
                </label>
                <label className="block text-xs font-semibold text-secondary">
                  Devise Stripe
                  <input value="USD" readOnly className="mt-1 w-full rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted" />
                </label>
              </div>
              <label className="block text-xs font-semibold text-secondary">
                Limites et fonctionnalités (JSON)
                <textarea
                  value={limitsJson}
                  onChange={(event) => setLimitsJson(event.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-primary"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-secondary">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                Disponible aux nouvelles inscriptions
              </label>
            </div>
            {error && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-rose-500/10 p-3 text-xs font-semibold text-rose-500">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-primary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void savePlan()}
                disabled={saving || !name.trim() || !priceMonthly}
                className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
