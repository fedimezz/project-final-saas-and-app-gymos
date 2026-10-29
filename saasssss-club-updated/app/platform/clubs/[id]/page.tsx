"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, ShieldOff, ShieldCheck, Tag, Mail, Calendar, ExternalLink, Pencil, Trash2, Ban, Save, X,
  CheckCircle2, KeyRound, CalendarPlus, Phone, Users2,
} from "lucide-react";
import ConfirmDialog from "@/components/platform/ConfirmDialog";
import { apiRequest, clubOrigin, daysUntil, formatDate, formatPrice } from "@/lib/platform-client";

interface ClubDetail {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  customDomain: string | null;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: { id: string; tier: string; name: string; priceMonthly: number; currency: string };
  } | null;
  settings: { name: string; logoUrl: string | null } | null;
  users: { id: string; name: string; email: string; phone: string | null; createdAt: string }[]; // OWNER(s)
  saasPayments: { id: string; amount: number; currency: string; status: string; paidAt: string | null; createdAt: string }[];
  _count: { users: number; sessions: number; payments: number };
}

interface Plan { id: string; tier: string; name: string; priceMonthly: number; currency: string; isActive: boolean }

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};
const STATUS_LABEL: Record<string, string> = { TRIAL: "Essai", ACTIVE: "Actif", SUSPENDED: "Suspendu", CANCELLED: "Annulé" };
const ROLE_LABEL: Record<string, string> = { OWNER: "Propriétaire", ADMIN: "Admins", COACH: "Coachs", MEMBER: "Membres" };
const PAYMENT_STYLE: Record<string, string> = {
  PAID: "text-emerald-500", PENDING: "text-amber-500", FAILED: "text-rose-500", REFUNDED: "text-slate-500",
};

type DialogKind = "suspend" | "activate" | "ban" | "delete" | "reset_password" | "extend_trial";

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

export default function PlatformClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", customDomain: "", ownerName: "", ownerEmail: "", ownerPhone: "" });
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [clubRes, plansRes] = await Promise.all([
      apiRequest<{ club: ClubDetail; roleCounts: Record<string, number> }>(`/api/platform/clubs/${id}`),
      apiRequest<{ plans: Plan[] }>("/api/platform/plans"),
    ]);
    if (clubRes.ok) {
      setClub(clubRes.data.club);
      setRoleCounts(clubRes.data.roleCounts ?? {});
    } else if (clubRes.status === 404) {
      setNotFound(true);
    } else {
      setError(clubRes.data.error ?? "Impossible de charger le club");
    }
    if (plansRes.ok) setPlans(plansRes.data.plans.filter((p) => p.isActive));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const owner = club?.users[0];

  const startEdit = () => {
    if (!club) return;
    setForm({
      name: club.name, slug: club.slug, customDomain: club.customDomain ?? "",
      ownerName: owner?.name ?? "", ownerEmail: owner?.email ?? "", ownerPhone: owner?.phone ?? "",
    });
    setError(null);
    setErrorField(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!club) return;
    setBusy(true);
    setError(null);
    setErrorField(null);
    const body: Record<string, unknown> = {};
    if (form.name.trim() !== club.name) body.name = form.name.trim();
    if (form.slug.trim() !== club.slug) body.slug = form.slug.trim();
    if (form.customDomain.trim() !== (club.customDomain ?? "")) body.customDomain = form.customDomain.trim() || null;
    if (owner) {
      const ownerPatch: Record<string, string> = {};
      if (form.ownerName.trim() !== owner.name) ownerPatch.name = form.ownerName.trim();
      if (form.ownerEmail.trim() !== owner.email) ownerPatch.email = form.ownerEmail.trim();
      if (form.ownerPhone.trim() !== (owner.phone ?? "")) ownerPatch.phone = form.ownerPhone.trim();
      if (Object.keys(ownerPatch).length) body.owner = ownerPatch;
    }
    if (Object.keys(body).length === 0) { setEditing(false); setBusy(false); return; }

    const res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PUT", json: body });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? "Erreur"); setErrorField(res.data.field ?? null); return; }
    setEditing(false);
    setNotice("Modifications enregistrées.");
    await load();
  };

  const patch = async (json: Record<string, unknown>, successMessage: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json });
    setBusy(false);
    if (!res.ok) { setError(res.data.error ?? "Erreur"); return false; }
    setNotice(successMessage);
    await load();
    return true;
  };

  const closeDialog = () => { if (!busy) { setDialog(null); setDialogError(null); } };

  const confirmDialog = async (value: string) => {
    if (!club || !dialog) return;
    setBusy(true);
    setDialogError(null);
    let res;
    let message = "";
    switch (dialog) {
      case "suspend":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json: { action: "suspend", reason: value || undefined } });
        message = "Club suspendu."; break;
      case "activate":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json: { action: "activate" } });
        message = "Club réactivé."; break;
      case "ban":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json: { action: "ban", reason: value || undefined } });
        message = "Club annulé (banni)."; break;
      case "extend_trial":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json: { action: "extend_trial", days: Number(value) } });
        message = `Essai prolongé de ${value} jour(s).`; break;
      case "reset_password":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "PATCH", json: { action: "reset_owner_password", password: value } });
        message = "Mot de passe du propriétaire réinitialisé."; break;
      case "delete":
        res = await apiRequest(`/api/platform/clubs/${id}`, { method: "DELETE", json: { confirmSlug: club.slug } });
        break;
    }
    setBusy(false);
    if (!res.ok) { setDialogError(res.data.error ?? "Erreur"); return; }
    if (dialog === "delete") { window.location.href = "/platform/clubs"; return; }
    setDialog(null);
    setNotice(message);
    await load();
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" /></div>;
  }

  if (notFound || !club) {
    return (
      <div className="max-w-3xl space-y-3">
        <Link href="/platform/clubs" className="flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Retour aux clubs</Link>
        <p className="text-sm text-rose-500">{notFound ? "Club introuvable (il a peut-être été supprimé)." : error ?? "Erreur de chargement."}</p>
      </div>
    );
  }

  const unusable = club.status === "SUSPENDED" || club.status === "CANCELLED";
  const trialLeft = daysUntil(club.trialEndsAt);
  const canExtendTrial = club.status === "TRIAL" || (club.status === "SUSPENDED" && club.suspendedReason === "Trial expired");
  const url = clubOrigin(club.slug);
  const slugChanged = editing && form.slug.trim() !== club.slug;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/platform/clubs" className="flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Retour aux clubs
      </Link>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-500">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {editing ? (
              <div className="space-y-2">
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Nom du club</span>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`mt-1 ${inputCls} font-bold`} /></label>
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Slug</span>
                  <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} className={`mt-1 ${inputCls} font-mono ${errorField === "slug" ? "border-rose-500/60" : ""}`} /></label>
                {slugChanged && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-600">Changer le slug change l&apos;adresse du club : les utilisateurs devront se reconnecter sur la nouvelle URL et les anciens liens cesseront de fonctionner.</p>}
                <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Domaine personnalisé</span>
                  <input value={form.customDomain} onChange={(e) => setForm({ ...form, customDomain: e.target.value })} placeholder="www.mongym.tn" className={`mt-1 ${inputCls} ${errorField === "customDomain" ? "border-rose-500/60" : ""}`} /></label>
              </div>
            ) : (
              <>
                <h1 className="truncate text-xl font-black text-primary">{club.name}</h1>
                <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 font-mono text-xs text-[var(--primary)] hover:underline"><ExternalLink className="h-3 w-3" /> {club.customDomain ?? url.replace(/^https?:\/\//, "")}</a>
              </>
            )}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[club.status] ?? ""}`}>{STATUS_LABEL[club.status] ?? club.status}</span>
        </div>

        {club.suspendedReason && unusable && (
          <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">
            {club.status === "CANCELLED" ? "Annulé" : "Suspendu"}{club.suspendedAt ? ` le ${formatDate(club.suspendedAt)}` : ""} — {club.suspendedReason}
          </p>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Utilisateurs" value={club._count.users} />
          <Stat label="Sessions" value={club._count.sessions} />
          <Stat label="Paiements membres" value={club._count.payments} />
          <Stat label="Créé le" value={formatDate(club.createdAt)} small />
        </div>
        {Object.keys(roleCounts).length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <Users2 className="h-3.5 w-3.5" />
            {Object.entries(roleCounts).map(([role, n]) => <span key={role}>{ROLE_LABEL[role] ?? role} : <strong className="text-secondary">{n}</strong></span>)}
          </p>
        )}

        {/* Owner */}
        <div className="mt-6 rounded-xl border border-border bg-background p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Propriétaire</p>
          {editing && owner ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="Nom" className={inputCls} />
              <input value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} placeholder="Téléphone" className={inputCls} />
              <input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} placeholder="Email" className={`${inputCls} sm:col-span-2 ${errorField === "ownerEmail" ? "border-rose-500/60" : ""}`} />
            </div>
          ) : owner ? (
            <div className="space-y-1.5 text-xs text-secondary">
              <p className="text-sm font-bold text-primary">{owner.name}</p>
              <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-emerald-500" /> {owner.email}</p>
              {owner.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-500" /> {owner.phone}</p>}
              <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-emerald-500" /> Inscrit le {formatDate(owner.createdAt)}</p>
            </div>
          ) : <p className="text-xs text-muted">Aucun propriétaire rattaché à ce club.</p>}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-2">
          {editing ? (
            <>
              <button disabled={busy} onClick={saveEdit} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Enregistrer
              </button>
              <button disabled={busy} onClick={() => { setEditing(false); setError(null); }} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-secondary"><X className="h-3.5 w-3.5" /> Annuler</button>
            </>
          ) : (
            <button disabled={busy} onClick={startEdit} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5 text-emerald-500" /> Modifier</button>
          )}
          {unusable ? (
            <button disabled={busy} onClick={() => setDialog("activate")} className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" /> Réactiver le club</button>
          ) : (
            <button disabled={busy} onClick={() => setDialog("suspend")} className="flex items-center gap-2 rounded-full border border-amber-500/40 px-4 py-2 text-xs font-extrabold text-amber-500 disabled:opacity-50"><ShieldOff className="h-3.5 w-3.5" /> Suspendre</button>
          )}
          {canExtendTrial && (
            <button disabled={busy} onClick={() => setDialog("extend_trial")} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50"><CalendarPlus className="h-3.5 w-3.5 text-emerald-500" /> Prolonger l&apos;essai</button>
          )}
          {owner && (
            <button disabled={busy} onClick={() => setDialog("reset_password")} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50"><KeyRound className="h-3.5 w-3.5 text-emerald-500" /> Mot de passe du propriétaire</button>
          )}
        </div>
      </div>

      {/* ── Subscription ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-primary">Abonnement SaaS</h2>
          <button disabled={busy} onClick={() => setShowPlanPicker((v) => !v)} className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold text-primary disabled:opacity-50"><Tag className="h-3.5 w-3.5 text-emerald-500" /> Changer de plan</button>
        </div>
        {club.subscription ? (
          <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-3">
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Plan</dt><dd className="mt-1 font-black text-primary">{club.subscription.plan.name}</dd><dd className="text-muted">{formatPrice(club.subscription.plan.priceMonthly, club.subscription.plan.currency)}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted">Statut</dt><dd className="mt-1 font-black text-primary">{club.subscription.status}</dd></div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{club.status === "TRIAL" ? "Fin de l'essai" : "Période en cours jusqu'au"}</dt>
              <dd className="mt-1 font-black text-primary">{formatDate(club.status === "TRIAL" ? club.trialEndsAt : club.subscription.currentPeriodEnd)}</dd>
              {club.status === "TRIAL" && trialLeft !== null && <dd className={trialLeft <= 3 ? "font-bold text-rose-500" : "text-muted"}>{trialLeft > 0 ? `${trialLeft} jour(s) restant(s)` : "Essai terminé"}</dd>}
            </div>
          </dl>
        ) : <p className="mt-3 text-xs text-muted">Aucun abonnement — choisissez un plan pour en créer un.</p>}

        {showPlanPicker && (
          <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-border bg-muted/50 p-3">
            {plans.map((plan) => {
              const current = plan.id === club.subscription?.plan.id;
              return (
                <button
                  key={plan.id}
                  disabled={busy || current}
                  onClick={async () => { if (await patch({ action: "change_plan", planId: plan.id }, `Plan changé : ${plan.name}.`)) setShowPlanPicker(false); }}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition disabled:opacity-60 ${current ? "bg-emerald-500 text-slate-950" : "border border-border bg-card text-secondary hover:border-emerald-500/40"}`}
                >
                  {plan.name} — {formatPrice(plan.priceMonthly, plan.currency)}
                </button>
              );
            })}
          </div>
        )}

        {club.saasPayments.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Derniers paiements</p>
            <ul className="divide-y divide-border text-xs">
              {club.saasPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <span className="text-secondary">{formatDate(p.paidAt ?? p.createdAt)}</span>
                  <span className="font-bold text-primary">{p.amount} {p.currency}</span>
                  <span className={`font-bold ${PAYMENT_STYLE[p.status] ?? "text-muted"}`}>{p.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Danger zone ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-rose-500/30 bg-card p-6">
        <h2 className="text-sm font-extrabold text-rose-500">Zone dangereuse</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-secondary"><strong className="text-primary">Annuler (bannir)</strong> — bloque l&apos;accès et annule l&apos;abonnement. Réversible via « Réactiver ».</p>
          {club.status !== "CANCELLED" && (
            <button disabled={busy} onClick={() => setDialog("ban")} className="flex flex-shrink-0 items-center justify-center gap-2 rounded-full border border-rose-500/40 px-4 py-2 text-xs font-extrabold text-rose-500 disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> Bannir</button>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-secondary"><strong className="text-primary">Supprimer définitivement</strong> — efface le club et toutes ses données. Irréversible.</p>
          <button disabled={busy} onClick={() => setDialog("delete")} className="flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-rose-500 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      {dialog === "suspend" && (
        <ConfirmDialog tone="danger" title={`Suspendre « ${club.name} » ?`} description="Les utilisateurs du club ne pourront plus se connecter. Aucune donnée n'est supprimée."
          inputLabel="Motif (optionnel, visible dans le journal)" confirmLabel="Suspendre" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
      {dialog === "activate" && (
        <ConfirmDialog title={`Réactiver « ${club.name} » ?`} description="Le club repasse au statut Actif."
          confirmLabel="Réactiver" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
      {dialog === "ban" && (
        <ConfirmDialog tone="danger" title={`Bannir « ${club.name} » ?`} description="Le club passe à « Annulé » : accès bloqué et abonnement annulé. Vous pourrez le réactiver plus tard."
          inputLabel="Motif (optionnel)" confirmLabel="Bannir" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
      {dialog === "extend_trial" && (
        <ConfirmDialog title="Prolonger l'essai" description={club.status === "SUSPENDED" ? "Le club est suspendu pour essai expiré : il sera aussi réactivé." : "Les jours sont ajoutés à la fin de l'essai actuelle."}
          inputLabel="Nombre de jours (1 – 90)" inputType="number" inputMin={1} inputMax={90} inputRequired confirmLabel="Prolonger" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
      {dialog === "reset_password" && (
        <ConfirmDialog title="Réinitialiser le mot de passe du propriétaire" description={<>Définit un nouveau mot de passe pour <strong>{owner?.email}</strong>. Transmettez-le-lui de manière sécurisée. Les sessions déjà ouvertes restent valides jusqu&apos;à expiration.</>}
          inputLabel="Nouveau mot de passe (8 caractères min.)" inputType="password" inputRequired confirmLabel="Réinitialiser" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
      {dialog === "delete" && (
        <ConfirmDialog tone="danger" title={`Supprimer définitivement « ${club.name} » ?`}
          description={<>Membres, réservations, paiements, planning et réglages seront effacés ({club._count.users} utilisateur{club._count.users > 1 ? "s" : ""}). <strong>Irréversible.</strong></>}
          requireText={club.slug} confirmLabel="Supprimer définitivement" loading={busy} error={dialogError} onConfirm={confirmDialog} onCancel={closeDialog} />
      )}
    </div>
  );
}

function Stat({ label, value, small = false }: { label: string; value: number | string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-black text-primary ${small ? "text-xs" : "text-sm"}`}>{value}</p>
    </div>
  );
}