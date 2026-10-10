"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Tag, Plus, Loader2, AlertCircle, Trash2, Pencil, X, Percent, Banknote } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Wired to the already-built backend (app/api/admin/promotions + the
// Promotion table) — the page used to be a static placeholder claiming no
// table existed, even though the schema/model/API were already there.

interface Promotion {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  startDate: string;
  endDate: string | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
  isPublic: boolean;
}

const emptyForm = {
  code: "",
  title: "",
  description: "",
  discountType: "PERCENT" as "PERCENT" | "FIXED",
  discountValue: "",
  startDate: "",
  endDate: "",
  maxUses: "",
  isActive: true,
  isPublic: true,
};

export default function PromotionsPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPromotions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promotions", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setPromotions(json.promotions);
      else setError(json.error || "Erreur de chargement");
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOwner) fetchPromotions(); else setLoading(false); }, [isOwner, fetchPromotions]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      code: p.code,
      title: p.title,
      description: p.description ?? "",
      discountType: p.discountType,
      discountValue: String(p.discountValue),
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate ? p.endDate.slice(0, 10) : "",
      maxUses: p.maxUses ? String(p.maxUses) : "",
      isActive: p.isActive,
      isPublic: p.isPublic,
    });
    setFormError("");
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.discountValue) {
      setFormError("Titre et valeur de la réduction sont requis.");
      return;
    }
    if (!editing && !form.code.trim()) {
      setFormError("Le code promo est requis.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        ...(editing ? {} : { code: form.code.trim() }),
        title: form.title.trim(),
        description: form.description.trim() || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        startDate: form.startDate || undefined,
        endDate: form.endDate || null,
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        isActive: form.isActive,
        isPublic: form.isPublic,
      };
      const res = await fetch(
        editing ? `/api/admin/promotions/${editing.id}` : "/api/admin/promotions",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (res.ok) {
        setFormOpen(false);
        fetchPromotions();
      } else {
        setFormError(json.error || "Erreur lors de l'enregistrement");
      }
    } catch {
      setFormError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: Promotion) => {
    await fetch(`/api/admin/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    fetchPromotions();
  };

  const remove = async (p: Promotion) => {
    if (!confirm(`Supprimer le code promo "${p.code}" ? Cette action est irréversible.`)) return;
    await fetch(`/api/admin/promotions/${p.id}`, { method: "DELETE", credentials: "include" });
    fetchPromotions();
  };

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Lock size={28} className="text-amber-500" />
        </div>
        <div>
          <p className="font-semibold text-primary">Réservé au propriétaire</p>
          <p className="text-sm text-muted mt-1">Les promotions ne sont gérées que par le rôle OWNER.</p>
        </div>
      </div>
    );
  }

  const isExpired = (p: Promotion) => p.endDate && new Date(p.endDate) < new Date();
  const isExhausted = (p: Promotion) => p.maxUses !== null && p.usedCount >= p.maxUses;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Promotions</h1>
          <p className="text-muted mt-1">
            Codes de réduction à donner aux membres — pour un abonnement, un renouvellement, une offre limitée…
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 flex-shrink-0"
        >
          <Plus size={16} /> Nouveau code
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 size={40} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
          <AlertCircle size={28} className="text-danger" />
          <p className="text-muted">{error}</p>
        </div>
      ) : promotions.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <Tag size={24} className="text-muted" />
          <p className="text-sm text-muted">Aucun code promo pour le moment.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {promotions.map((p) => {
            const expired = isExpired(p);
            const exhausted = isExhausted(p);
            const inactive = !p.isActive || expired || exhausted;
            return (
              <div key={p.id} className={`bg-card border border-border rounded-2xl p-5 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm px-2 py-1 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                      {p.code}
                    </span>
                    {p.discountType === "PERCENT" ? (
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                        <Percent size={11} /> {p.discountValue}%
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                        <Banknote size={11} /> {p.discountValue} TND
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted" title="Modifier">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(p)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <p className="font-semibold text-primary text-sm mb-1">{p.title}</p>
                {p.description && <p className="text-xs text-muted mb-3">{p.description}</p>}

                <div className="text-xs text-muted space-y-1 mb-3">
                  <p>
                    Utilisé {p.usedCount}
                    {p.maxUses ? ` / ${p.maxUses}` : ""} fois
                  </p>
                  {p.endDate && (
                    <p className={expired ? "text-red-500 font-medium" : ""}>
                      {expired ? "Expiré le " : "Valide jusqu'au "}
                      {new Date(p.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => toggleActive(p)}
                  disabled={expired || exhausted}
                  className={`w-full text-center py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    p.isActive
                      ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                      : "bg-muted/40 text-muted hover:bg-muted/60"
                  }`}
                >
                  {expired ? "Expiré" : exhausted ? "Épuisé" : p.isActive ? "Actif — cliquer pour désactiver" : "Inactif — cliquer pour activer"}
                </button>
                <p className="mt-1.5 text-center text-[11px] text-muted">
                  {p.isPublic ? "Visible sur le site du club" : "Code privé — non affiché sur le site"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-primary text-lg">{editing ? "Modifier le code promo" : "Nouveau code promo"}</h2>
              <button onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-muted/40 text-muted">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {!editing && (
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Code</label>
                  <input
                    type="text"
                    placeholder="ETE2026"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Titre</label>
                <input
                  type="text"
                  placeholder="Offre spéciale été"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Description (optionnel)</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Type</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value as "PERCENT" | "FIXED" }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  >
                    <option value="PERCENT">Pourcentage (%)</option>
                    <option value="FIXED">Montant fixe (TND)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Valeur</label>
                  <input
                    type="number"
                    min={0}
                    max={form.discountType === "PERCENT" ? 100 : undefined}
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Début</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Fin (optionnel)</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Nombre d&apos;utilisations max (optionnel)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="Illimité"
                  value={form.maxUses}
                  onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-primary cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded"
                />
                Actif immédiatement
              </label>

              <label className="flex items-start gap-2 text-sm text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
                  className="rounded mt-0.5"
                />
                <span>
                  Afficher sur le site du club
                  <span className="block text-xs text-muted">
                    L&apos;offre (et son code) apparaît sur la page Offres tant qu&apos;elle est active et dans ses dates.
                    Décochez pour un code privé.
                  </span>
                </span>
              </label>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <button
                onClick={submit}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing ? "Enregistrer" : "Créer le code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
