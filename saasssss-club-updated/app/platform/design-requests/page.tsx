"use client";
// /platform/design-requests — SUPER_ADMIN queue for theme / 3D-model change requests. Approving
// issues a one-time grant (7 days) that the club's owner applies themselves; rejecting closes it.
import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Palette, XCircle } from "lucide-react";
import { HERO_MODELS, getTheme } from "@/lib/website-themes";

type Status = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED" | "EXPIRED";
interface Row {
  id: string;
  status: Status;
  requestedThemeId: string | null;
  requestedHeroModel: string | null;
  reason: string | null;
  reviewNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  club: { id: string; name: string; slug: string };
  requester: { name: string; email: string } | null;
}
const LABEL: Record<Status, string> = { PENDING: "En attente", APPROVED: "Approuvée", REJECTED: "Refusée", CONSUMED: "Appliquée", CANCELLED: "Annulée", EXPIRED: "Expirée" };
const TABS: { label: string; value: Status | "" }[] = [
  { label: "En attente", value: "PENDING" }, { label: "Approuvées", value: "APPROVED" }, { label: "Appliquées", value: "CONSUMED" },
  { label: "Refusées", value: "REJECTED" }, { label: "Toutes", value: "" },
];
const heroName = (id: string | null) => (id === "custom" ? "Modèle personnalisé" : id === "none" ? "Aucun objet 3D" : HERO_MODELS.find((m) => m.id === id)?.name ?? id);

export default function PlatformDesignRequestsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status | "">("PENDING");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), ...(status && { status }) });
      const res = await fetch(`/api/platform/design-requests?${qs}`, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Chargement impossible");
      setRows(json.requests);
      setCounts(json.countByStatus ?? {});
      setPages(json.pagination?.totalPages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [page, status]);
  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, action: "approve" | "reject") => {
    if (acting) return;
    setActing(id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/design-requests/${id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: notes[id] || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setError(json?.error || "Action impossible"); return; }
      await load();
    } catch {
      setError("Erreur réseau");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-primary"><Palette className="h-6 w-6 text-emerald-500" /> Changements de thème / modèle 3D</h1>
        <p className="mt-1 text-sm text-muted">Approuver donne au club un changement unique, valable 7 jours. Rien n&apos;est modifié tant que le propriétaire ne l&apos;applique pas.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.label} type="button" onClick={() => { setStatus(t.value); setPage(1); }}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${status === t.value ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border text-muted"}`}>
            {t.label}{t.value && counts[t.value] ? ` (${counts[t.value]})` : ""}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{error}</p>}
      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted">Aucune demande.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="space-y-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-primary"><Building2 size={14} /> {r.club.name} <span className="font-normal text-muted">({r.club.slug})</span></span>
                <span className="rounded-full bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-primary">{LABEL[r.status]}</span>
              </div>
              <p className="text-sm text-primary">
                {r.requestedThemeId && <>Thème → <b>{getTheme(r.requestedThemeId).name}</b>. </>}
                {r.requestedHeroModel && <>Modèle 3D → <b>{heroName(r.requestedHeroModel)}</b>.</>}
              </p>
              {r.reason && <p className="whitespace-pre-wrap text-sm text-muted">« {r.reason} »</p>}
              <p className="text-xs text-muted">{r.requester ? `${r.requester.name} · ${r.requester.email} · ` : ""}{new Date(r.createdAt).toLocaleString("fr-FR")}{r.expiresAt && r.status === "APPROVED" ? ` · valable jusqu'au ${new Date(r.expiresAt).toLocaleDateString("fr-FR")}` : ""}</p>
              {r.reviewNote && <p className="border-t border-border pt-2 text-xs text-muted">Note : {r.reviewNote}</p>}
              {r.status === "PENDING" && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <input value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} maxLength={500} placeholder="Note pour le propriétaire (facultatif)"
                    className="min-w-[200px] flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs text-primary" />
                  <button type="button" disabled={!!acting} onClick={() => void review(r.id, "approve")} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:opacity-60">
                    {acting === r.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approuver
                  </button>
                  <button type="button" disabled={!!acting} onClick={() => void review(r.id, "reject")} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-bold text-rose-500 disabled:opacity-60">
                    <XCircle size={12} /> Refuser
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs text-muted">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente" className="disabled:opacity-40"><ChevronLeft size={16} /></button>
          Page {page} / {pages}
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante" className="disabled:opacity-40"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
