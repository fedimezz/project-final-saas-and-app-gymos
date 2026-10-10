"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Tag, Plus, Loader2, AlertCircle, Trash2, Pencil, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { MEMBERSHIP_CURRENCIES, formatMembershipPrice, isMembershipCurrency, type MembershipCurrency } from "@/lib/payment-currencies";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: MembershipCurrency;
  durationDays: number;
  features: string[];
  isActive: boolean;
}

const emptyForm = {
  name: "",
  description: "",
  price: "",
  currency: "TND" as MembershipCurrency,
  durationDays: "30",
  features: "",
  isActive: true,
};

export default function PlansPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/plans", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setPlans(json.plans);
      else setError(json.error || "Erreur de chargement");
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOwner) fetchPlans(); else setLoading(false); }, [isOwner, fetchPlans]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      currency: p.currency,
      durationDays: String(p.durationDays),
      features: p.features.join("\n"),
      isActive: p.isActive,
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleSave = async () => {
    setFormError("");
    const price = Number(form.price);
    const durationDays = Number(form.durationDays);

    if (!form.name.trim()) return setFormError("Le nom est requis");
    if (!Number.isFinite(price) || price < 0) return setFormError("Le prix doit être un nombre positif");
    if (!Number.isFinite(durationDays) || durationDays <= 0) return setFormError("La durée doit être un nombre de jours positif");

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        currency: form.currency,
        durationDays,
        features: form.features.split("\n").map((f) => f.trim()).filter(Boolean),
        isActive: form.isActive,
      };
      const res = await fetch(editing ? `/api/admin/plans/${editing.id}` : "/api/admin/plans", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || "Erreur lors de l'enregistrement");
        return;
      }
      setFormOpen(false);
      fetchPlans();
    } catch {
      setFormError("Erreur serveur");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Plan) => {
    if (!confirm(`Retirer l'offre "${p.name}" ? Si des membres y ont déjà souscrit, elle sera juste désactivée.`)) return;
    try {
      const res = await fetch(`/api/admin/plans/${p.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) fetchPlans();
    } catch {
      // no-op — fetchPlans below will still reflect real state on next load
    }
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock size={40} className="text-muted mb-4" />
        <h2 className="text-xl font-bold text-primary">Réservé au propriétaire</h2>
        <p className="text-muted mt-1">Seul le propriétaire du club peut gérer les offres et les tarifs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Offres & tarifs</h1>
          <p className="text-muted mt-1">
            Ces offres et leur prix sont ceux affichés publiquement sur la page « Offres » du site.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:opacity-90 transition"
        >
          <Plus size={18} />
          Nouvelle offre
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-4">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted">
          Aucune offre pour l&apos;instant — créez-en une pour qu&apos;elle apparaisse sur la page publique.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className={`bg-card border border-border rounded-2xl p-5 flex flex-col ${!p.isActive ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-bold text-primary">{p.name}</h3>
                {!p.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-800 text-muted">Inactive</span>
                )}
              </div>
              <p className="text-2xl font-extrabold text-[var(--primary)] mb-1">{formatMembershipPrice(p.price, p.currency)}</p>
              <p className="text-xs text-muted mb-3">{p.durationDays} jours</p>
              {p.description && <p className="text-sm text-muted mb-3">{p.description}</p>}
              {p.features.length > 0 && (
                <ul className="text-sm text-muted mb-4 space-y-1 flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Tag size={12} className="mt-1 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 mt-auto pt-2">
                <button
                  onClick={() => openEdit(p)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                >
                  <Pencil size={14} />
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-primary">{editing ? "Modifier l'offre" : "Nouvelle offre"}</h2>
              <button onClick={() => setFormOpen(false)} className="text-muted hover:text-primary">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nom (ex: Premium)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
              />
              <textarea
                placeholder="Description (optionnelle)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">Prix</label>
                  <input
                    type="number"
                    min="0"
                    step={form.currency === "TND" ? "0.001" : "0.01"}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Devise</label>
                  <select
                    value={form.currency}
                    onChange={(e) => {
                      if (isMembershipCurrency(e.target.value)) setForm({ ...form, currency: e.target.value });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card"
                  >
                    {MEMBERSHIP_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
                <p className="text-xs text-muted">
                  Les membres en Tunisie règlent à l&apos;accueil. Stripe accepte les offres en USD, EUR, GBP, CAD et CHF.
                </p>
                <div>
                  <label className="text-xs text-muted mb-1 block">Durée (jours)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.durationDays}
                    onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                  />
                </div>
              </div>
              <textarea
                placeholder={"Avantages, un par ligne\nex: Accès illimité à la salle\nPiscine et sauna"}
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-transparent"
                rows={3}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Visible sur la page publique « Offres »
              </label>

              {formError && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {formError}
                </p>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : editing ? "Enregistrer" : "Créer l'offre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
