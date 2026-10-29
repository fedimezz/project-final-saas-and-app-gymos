"use client";
// Owner UI for the theme / 3D-model lock (lib/design-lock.ts): shows the lock, lets the owner file a
// request, follow it, cancel it and — once SUPER_ADMIN has approved — spend the one-time grant.
// Every rule is enforced by the API and the database; this component only reflects them.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Loader2, Lock, Send, XCircle } from "lucide-react";
import { HERO_MODELS, SELECTABLE_THEME_PRESETS, getTheme } from "@/lib/website-themes";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED" | "EXPIRED";
interface DesignRequest {
  id: string;
  requestedThemeId: string | null;
  requestedHeroModel: string | null;
  reason: string | null;
  status: Status;
  reviewNote: string | null;
  expiresAt: string | null;
  createdAt: string;
}
interface State {
  locked: boolean;
  themeId: string;
  heroModel: string | null;
  requests: DesignRequest[];
  open: DesignRequest | null;
}

const STATUS_LABEL: Record<Status, string> = {
  PENDING: "En attente de validation",
  APPROVED: "Approuvée — changement à appliquer",
  REJECTED: "Refusée",
  CONSUMED: "Appliquée",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
};

function heroName(id: string | null): string {
  if (!id) return "Modèle par défaut du thème";
  if (id === "custom") return "Mon modèle 3D";
  if (id === "none") return "Aucun objet 3D";
  return HERO_MODELS.find((m) => m.id === id)?.name ?? id;
}
function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";
}

export default function DesignChangePanel({ onApplied }: { onApplied?: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [themeId, setThemeId] = useState("");
  const [heroModel, setHeroModel] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"send" | "cancel" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/design-change", { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Chargement impossible");
      setState(json as State);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Chargement impossible");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (kind: "send" | "cancel" | "apply") => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const url = kind === "apply" ? "/api/admin/design-change/apply" : "/api/admin/design-change";
      const body = kind === "send"
        ? JSON.stringify({ ...(themeId && { themeId }), ...(heroModel && { heroModel }), reason })
        : undefined;
      const res = await fetch(url, {
        method: kind === "cancel" ? "DELETE" : "POST",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error || "Action impossible"); return; }
      if (kind === "send") { setNotice("Demande envoyée. Vous serez prévenu ici dès qu'elle est traitée."); setThemeId(""); setHeroModel(""); setReason(""); }
      if (kind === "cancel") setNotice("Demande annulée.");
      if (kind === "apply") {
        setNotice("Changement appliqué. Votre thème / modèle 3D sont de nouveau verrouillés.");
        window.dispatchEvent(new Event("club-settings-updated"));
        onApplied?.();
      }
      await load();
    } catch {
      setError("Erreur réseau");
    } finally {
      setBusy(null);
    }
  };

  if (loadError) return <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{loadError}</p>;
  if (!state) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted" /></div>;

  if (!state.locked) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm">
        <p className="font-semibold text-primary">Votre thème et votre modèle 3D ne sont pas encore verrouillés.</p>
        <p className="mt-1 text-muted">
          Choisissez-les dans <Link href="/admin/appearance" className="font-semibold underline">Apparence</Link>. Ils seront verrouillés une fois la configuration du site terminée.
        </p>
      </div>
    );
  }

  const open = state.open;
  const field = "w-full rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40";

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
        <Lock size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold text-amber-700 dark:text-amber-400">Thème et modèle 3D verrouillés</p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
            Actuellement : <b>{getTheme(state.themeId).name}</b> · <b>{heroName(state.heroModel)}</b>. Pour en changer, envoyez une demande : si elle est approuvée,
            vous disposez d&apos;<b>un seul</b> changement, à appliquer dans les 7 jours.
          </p>
        </div>
      </div>

      {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-600"><AlertCircle size={14} /> {error}</p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">{notice}</p>}

      {open?.status === "APPROVED" && (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} /> Changement approuvé — valable jusqu&apos;au {fmt(open.expiresAt)}</p>
          <p className="text-sm text-primary">
            {open.requestedThemeId && <>Nouveau thème : <b>{getTheme(open.requestedThemeId).name}</b>. </>}
            {open.requestedHeroModel && <>Nouveau modèle 3D : <b>{heroName(open.requestedHeroModel)}</b>.</>}
          </p>
          {open.reviewNote && <p className="text-xs text-muted">Message de l&apos;équipe : {open.reviewNote}</p>}
          {open.requestedHeroModel === "custom" && (
            <p className="text-xs text-muted">Téléversez d&apos;abord votre fichier .glb / .gltf dans <Link href="/admin/appearance" className="underline">Apparence</Link>, puis appliquez.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void call("apply")} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy === "apply" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Appliquer le changement (usage unique)
            </button>
            <button type="button" onClick={() => void call("cancel")} disabled={!!busy} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-primary disabled:opacity-60">Renoncer</button>
          </div>
        </div>
      )}

      {open?.status === "PENDING" && (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Clock size={16} /> Demande en attente de validation</p>
          <p className="text-sm text-muted">
            {open.requestedThemeId && <>Thème demandé : <b>{getTheme(open.requestedThemeId).name}</b>. </>}
            {open.requestedHeroModel && <>Modèle 3D demandé : <b>{heroName(open.requestedHeroModel)}</b>.</>}
          </p>
          <button type="button" onClick={() => void call("cancel")} disabled={!!busy} className="text-xs font-medium text-muted underline disabled:opacity-60">Annuler ma demande</button>
        </div>
      )}

      {!open && (
        <form onSubmit={(e) => { e.preventDefault(); void call("send"); }} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-primary">Demander un changement</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nouveau thème
              <select value={themeId} onChange={(e) => setThemeId(e.target.value)} className={`${field} mt-1 normal-case`}>
                <option value="">Ne pas changer</option>
                {SELECTABLE_THEME_PRESETS.filter((t) => t.id !== state.themeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">Nouveau modèle 3D
              <select value={heroModel} onChange={(e) => setHeroModel(e.target.value)} className={`${field} mt-1 normal-case`}>
                <option value="">Ne pas changer</option>
                {HERO_MODELS.filter((m) => m.id !== state.heroModel).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {state.heroModel !== "custom" && <option value="custom">Mon propre modèle (.glb / .gltf)</option>}
                {state.heroModel !== "none" && <option value="none">Aucun objet 3D</option>}
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">Pourquoi ce changement ?
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={`${field} mt-1 resize-none normal-case`} placeholder="Ex : nous changeons de marque et voulons un style plus sobre." />
          </label>
          <button type="submit" disabled={!!busy || (!themeId && !heroModel) || reason.trim().length < 10} className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Envoyer la demande
          </button>
        </form>
      )}

      {state.requests.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary">Historique</h3>
          <ul className="space-y-2">
            {state.requests.map((r) => (
              <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    {r.status === "REJECTED" || r.status === "CANCELLED" || r.status === "EXPIRED" ? <XCircle size={12} /> : <Clock size={12} />} {STATUS_LABEL[r.status]}
                  </span>
                  <span className="text-[11px] text-muted">{fmt(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {r.requestedThemeId && <>Thème : {getTheme(r.requestedThemeId).name}. </>}
                  {r.requestedHeroModel && <>Modèle 3D : {heroName(r.requestedHeroModel)}.</>}
                </p>
                {r.reviewNote && <p className="mt-1 text-xs text-muted">Réponse : {r.reviewNote}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
