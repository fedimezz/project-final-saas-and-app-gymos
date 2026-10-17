"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Search, Loader2, ChevronLeft, ChevronRight, Plus, ShieldCheck, ShieldOff, Trash2, ExternalLink,
  ArrowDownUp, X, CheckCircle2,
} from "lucide-react";
import ConfirmDialog from "@/components/platform/ConfirmDialog";
import CreateClubModal from "@/components/platform/CreateClubModal";
import { apiRequest, clubOrigin, daysUntil, formatDate, formatPrice } from "@/lib/platform-client";

interface ClubRow {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  customDomain: string | null;
  trialEndsAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  subscription: { status: string; plan: { id: string; tier: string; name: string; priceMonthly: number; currency: string } } | null;
  owner: { id: string; name: string; email: string } | null;
  _count: { users: number };
}

interface ListResponse {
  clubs: ClubRow[];
  statusCounts: Record<string, number>;
  pagination: { page: number; totalPages: number; total: number };
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};
const STATUS_LABEL: Record<string, string> = { TRIAL: "Essai", ACTIVE: "Actif", SUSPENDED: "Suspendu", CANCELLED: "Annulé" };
const STATUS_FILTERS = ["", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"] as const;
const PLAN_FILTERS = [
  { value: "", label: "Tous les plans" },
  { value: "STARTER", label: "Starter" },
  { value: "PRO", label: "Pro" },
  { value: "BUSINESS", label: "Business" },
];
const SORTS = [
  { value: "createdAt:desc", label: "Plus récents" },
  { value: "createdAt:asc", label: "Plus anciens" },
  { value: "name:asc", label: "Nom (A → Z)" },
  { value: "name:desc", label: "Nom (Z → A)" },
  { value: "status:asc", label: "Statut" },
];

type Dialog =
  | { kind: "suspend"; club: ClubRow }
  | { kind: "activate"; club: ClubRow }
  | { kind: "delete"; club: ClubRow };

export default function PlatformClubsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    const [sortField, sortOrder] = sort.split(":");
    const params = new URLSearchParams({ page: String(page), sort: sortField, order: sortOrder });
    if (search.trim()) params.set("search", search.trim());
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    const res = await apiRequest<ListResponse>(`/api/platform/clubs?${params}`);
    if (id !== reqId.current) return; // a newer request superseded this one
    if (res.ok) { setData(res.data); setLoadError(null); }
    else setLoadError(res.data.error ?? "Impossible de charger les clubs");
    setLoading(false);
  }, [page, search, status, plan, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const closeDialog = () => { if (!busy) { setDialog(null); setDialogError(null); } };

  const runDialog = async (value: string) => {
    if (!dialog) return;
    setBusy(true);
    setDialogError(null);
    const { club } = dialog;
    const res =
      dialog.kind === "delete"
        ? await apiRequest(`/api/platform/clubs/${club.id}`, { method: "DELETE", json: { confirmSlug: value || club.slug } })
        : await apiRequest(`/api/platform/clubs/${club.id}`, {
            method: "PATCH",
            json: dialog.kind === "suspend" ? { action: "suspend", reason: value || undefined } : { action: "activate" },
          });
    setBusy(false);
    if (!res.ok) { setDialogError(res.data.error ?? "Erreur"); return; }
    setDialog(null);
    setNotice(
      dialog.kind === "delete" ? `« ${club.name} » a été supprimé.`
      : dialog.kind === "suspend" ? `« ${club.name} » est suspendu.`
      : `« ${club.name} » est réactivé.`,
    );
    load();
  };

  const clubs = data?.clubs ?? [];
  const counts = data?.statusCounts ?? {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);
  const pagination = data?.pagination;
  const filtered = !!(search || status || plan);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-black text-primary">Clubs</h1>
          <p className="text-xs text-muted">{totalAll} club{totalAll > 1 ? "s" : ""} sur la plateforme</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950">
          <Plus className="h-3.5 w-3.5" /> Nouveau club
        </button>
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-500">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Nom, slug, domaine, email du propriétaire…"
            aria-label="Rechercher un club"
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={plan} onChange={(e) => { setPage(1); setPlan(e.target.value); }} aria-label="Filtrer par plan" className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-secondary">
            {PLAN_FILTERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-secondary">
            <ArrowDownUp className="h-3.5 w-3.5" />
            <select value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }} aria-label="Trier" className="bg-transparent focus:outline-none">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || "all"}
            onClick={() => { setPage(1); setStatus(s); }}
            className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
              status === s ? "bg-emerald-500 text-slate-950" : "border border-border bg-card text-secondary hover:border-emerald-500/40"
            }`}
          >
            {s ? STATUS_LABEL[s] : "Tous"} <span className="opacity-60">{s ? counts[s] ?? 0 : totalAll}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" /></div>
        ) : loadError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-xs font-semibold text-rose-500">{loadError}</p>
            <button onClick={() => { setLoading(true); load(); }} className="mt-3 rounded-full border border-border px-4 py-1.5 text-[11px] font-bold text-primary">Réessayer</button>
          </div>
        ) : clubs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-xs text-muted">{filtered ? "Aucun club ne correspond à ces filtres." : "Aucun club pour le moment."}</p>
            {!filtered && <button onClick={() => setShowCreate(true)} className="mt-3 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-extrabold text-slate-950">Créer le premier club</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/60 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                  <th className="px-4 py-3">Club</th>
                  <th className="px-4 py-3">Propriétaire</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Utilisateurs</th>
                  <th className="px-4 py-3">Créé le</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clubs.map((club) => {
                  const left = club.status === "TRIAL" ? daysUntil(club.trialEndsAt) : null;
                  const unusable = club.status === "SUSPENDED" || club.status === "CANCELLED";
                  return (
                    <tr key={club.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/platform/clubs/${club.id}`} className="font-bold text-primary hover:text-emerald-500">{club.name}</Link>
                        <p className="font-mono text-[10px] text-muted">{club.customDomain ?? club.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        {club.owner ? (<><p className="font-semibold text-primary">{club.owner.name}</p><p className="text-[10px] text-muted">{club.owner.email}</p></>) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[club.status] ?? ""}`}>{STATUS_LABEL[club.status] ?? club.status}</span>
                        {left !== null && <p className={`mt-1 text-[10px] ${left <= 3 ? "font-bold text-rose-500" : "text-muted"}`}>{left > 0 ? `${left} j restants` : "Essai terminé"}</p>}
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        {club.subscription ? (<>{club.subscription.plan.name}<p className="text-[10px] text-muted">{formatPrice(club.subscription.plan.priceMonthly, club.subscription.plan.currency)}</p></>) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-secondary">{club._count.users}</td>
                      <td className="px-4 py-3 text-secondary">{formatDate(club.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <a href={clubOrigin(club.slug)} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${club.name}`} title="Ouvrir le site du club" className="rounded-lg p-2 text-muted hover:bg-muted hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>
                          {unusable ? (
                            <button onClick={() => setDialog({ kind: "activate", club })} aria-label={`Réactiver ${club.name}`} title="Réactiver" className="rounded-lg p-2 text-emerald-500 hover:bg-emerald-500/10"><ShieldCheck className="h-3.5 w-3.5" /></button>
                          ) : (
                            <button onClick={() => setDialog({ kind: "suspend", club })} aria-label={`Suspendre ${club.name}`} title="Suspendre" className="rounded-lg p-2 text-amber-500 hover:bg-amber-500/10"><ShieldOff className="h-3.5 w-3.5" /></button>
                          )}
                          <button onClick={() => setDialog({ kind: "delete", club })} aria-label={`Supprimer ${club.name}`} title="Supprimer" className="rounded-lg p-2 text-rose-500 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
                          <Link href={`/platform/clubs/${club.id}`} className="ml-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-primary hover:border-emerald-500/40">Gérer</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente" className="rounded-full border border-border bg-card p-2 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs font-semibold text-secondary">Page {page} / {pagination.totalPages} · {pagination.total} résultat{pagination.total > 1 ? "s" : ""}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante" className="rounded-full border border-border bg-card p-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}

      {showCreate && <CreateClubModal onClose={() => setShowCreate(false)} onCreated={() => { setPage(1); load(); }} />}

      {dialog?.kind === "suspend" && (
        <ConfirmDialog
          tone="danger" title={`Suspendre « ${dialog.club.name} » ?`}
          description="Les membres et le staff du club ne pourront plus se connecter tant qu'il ne sera pas réactivé. Aucune donnée n'est supprimée."
          inputLabel="Motif (optionnel, visible dans le journal)" inputPlaceholder="Impayé, abus, demande du client…"
          confirmLabel="Suspendre" loading={busy} error={dialogError} onConfirm={runDialog} onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "activate" && (
        <ConfirmDialog
          title={`Réactiver « ${dialog.club.name} » ?`}
          description="Le club repasse au statut Actif et ses utilisateurs peuvent de nouveau se connecter."
          confirmLabel="Réactiver" loading={busy} error={dialogError} onConfirm={runDialog} onCancel={closeDialog}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          tone="danger" title={`Supprimer définitivement « ${dialog.club.name} » ?`}
          description={<>Cette action est <strong>irréversible</strong> : membres, réservations, paiements, planning et réglages du club seront effacés ({dialog.club._count.users} utilisateur{dialog.club._count.users > 1 ? "s" : ""}). Pour simplement bloquer l&apos;accès, préférez « Suspendre ».</>}
          requireText={dialog.club.slug} confirmLabel="Supprimer définitivement"
          loading={busy} error={dialogError} onConfirm={(v) => runDialog(v)} onCancel={closeDialog}
        />
      )}
    </div>
  );
}