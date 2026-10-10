"use client";
// WebsiteChangeRequestPanel — shown once the guided website setup is locked
// (GymSettings.websiteCustomizationLocked). Lets the owner describe a
// change and see the status of past requests; platform staff triage these
// from /platform/website-requests.
import { useCallback, useEffect, useState } from "react";
import { Lock, Loader2, Send, Clock, CheckCircle2, XCircle, Wrench, AlertCircle } from "lucide-react";

interface ChangeRequest {
  id: string;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

const STATUS_META: Record<ChangeRequest["status"], { label: string; icon: React.ElementType; color: string; bg: string }> = {
  PENDING: { label: "En attente", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
  APPROVED: { label: "Approuvée", icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-500/10" },
  REJECTED: { label: "Refusée", icon: XCircle, color: "text-red-600", bg: "bg-red-500/10" },
  APPLIED: { label: "Appliquée", icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

export default function WebsiteChangeRequestPanel({ showLockedBanner = true }: { showLockedBanner?: boolean }) {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/website-change-requests", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setRequests(json.requests ?? []);
    } catch {
      /* the form still works even if history fails to load */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      setError("Décrivez le changement souhaité (10 caractères minimum).");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/admin/website-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (res.ok) {
        setDescription("");
        setSuccess(true);
        fetchRequests();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(json.error || "Erreur lors de l'envoi de la demande");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {showLockedBanner && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <Lock size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-400 text-sm">
              Personnalisation du site verrouillée
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
              Vous avez utilisé vos deux sessions de personnalisation directe (configuration initiale +
              une modification). Pour tout nouveau changement, décrivez-le ci-dessous — notre équipe
              l&apos;examinera et l&apos;appliquera.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <label htmlFor="change-request-desc" className="block text-xs font-semibold text-muted uppercase tracking-wide">
          Décrivez le changement souhaité
        </label>
        <textarea
          id="change-request-desc"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : Changer la couleur principale en bleu marine, remplacer la photo d'accueil, mettre à jour le texte de la page Offres…"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 resize-none"
        />
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {success && <p className="text-sm text-emerald-600">Demande envoyée avec succès.</p>}
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Envoyer la demande
        </button>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-primary mb-3">Historique des demandes</h3>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted">Aucune demande envoyée pour le moment.</p>
        ) : (
          <ul className="space-y-2.5">
            {requests.map((r) => {
              const meta = STATUS_META[r.status];
              const StatusIcon = meta.icon;
              return (
                <li key={r.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}>
                      <StatusIcon size={12} /> {meta.label}
                    </span>
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm text-primary whitespace-pre-wrap">{r.description}</p>
                  {r.reviewNote && (
                    <p className="text-xs text-muted mt-2 border-t border-border pt-2">
                      Réponse : {r.reviewNote}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
