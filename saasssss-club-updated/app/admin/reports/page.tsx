"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Users, CreditCard, CalendarCheck, Dumbbell, Flag, MessageSquare, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";

interface ReportsData {
  dailyAttendance: { label: string; count: number }[];
  membership: { active: number; pending: number; expired: number; cancelled: number; suspended: number };
  payments: {
    totalsThisMonth: { currency: string; amount: number }[];
    countThisMonth: number;
    recent: { id: string; amount: number; currency: string; status: string; method: string; memberName: string; date: string }[];
  };
  memberGrowth?: { label: string; count: number }[];
  coachPerformance?: { coach: string; attendances: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "Payé", PENDING: "En attente", FAILED: "Échoué", REFUNDED: "Remboursé",
};

export default function ReportsPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [tab, setTab] = useState<"stats" | "signalements">("stats");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setData(json);
      else setError(json.error || "Erreur de chargement");
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-primary">Rapports</h1>
        <p className="text-muted mt-1">
          {isOwner
            ? "Fréquentation, adhésions, paiements, croissance, coachs et signalements des membres."
            : "Fréquentation, adhésions, paiements et signalements des membres."}
        </p>
      </div>
      <div className="flex gap-1.5 bg-muted/30 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("stats")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
            tab === "stats" ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"
          }`}
        >
          Statistiques
        </button>
        <button
          onClick={() => setTab("signalements")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            tab === "signalements" ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"
          }`}
        >
          <Flag size={14} /> Signalements des membres
        </button>
      </div>
    </div>
  );

  if (tab === "signalements") {
    return (
      <div className="space-y-8 animate-fade-in">
        {header}
        <MemberReportsPanel />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in">
        {header}
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 size={40} className="animate-spin text-[var(--primary)]" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-8 animate-fade-in">
        {header}
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
          <AlertCircle size={28} className="text-danger" />
          <p className="text-muted">{error || "Impossible de charger les rapports."}</p>
        </div>
      </div>
    );
  }

  const maxAttendance = Math.max(...data.dailyAttendance.map((d) => d.count), 1);

  return (
    <div className="space-y-8 animate-fade-in">
      {header}

      {/* Daily attendance */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <CalendarCheck size={18} className="text-[var(--primary)]" />
          <h2 className="font-bold text-primary">Présences (7 derniers jours)</h2>
        </div>
        <div className="flex items-end justify-between gap-3 h-40">
          {data.dailyAttendance.map((d) => (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-blue-500/70 rounded-t-lg"
                  style={{ height: `${Math.max((d.count / maxAttendance) * 100, 2)}%` }}
                  title={`${d.count} présences`}
                />
              </div>
              <span className="text-xs text-muted">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membership report */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-[var(--primary)]" />
            <h2 className="font-bold text-primary">Adhésions</h2>
          </div>
          <div className="space-y-2 text-sm">
            {[
              { label: "Actives", value: data.membership.active, color: "text-emerald-600" },
              { label: "En attente", value: data.membership.pending, color: "text-amber-500" },
              { label: "Expirées", value: data.membership.expired, color: "text-red-500" },
              { label: "Annulées", value: data.membership.cancelled, color: "text-muted" },
              { label: "Suspendues", value: data.membership.suspended, color: "text-muted" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                <span className="text-muted">{row.label}</span>
                <span className={`font-semibold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payment report */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard size={18} className="text-[var(--primary)]" />
            <h2 className="font-bold text-primary">Paiements ce mois</h2>
          </div>
          <div className="text-2xl font-bold text-primary mb-1 space-y-1">
            {data.payments.totalsThisMonth.length
              ? data.payments.totalsThisMonth.map((entry) => <p key={entry.currency}>{formatMembershipPrice(entry.amount, entry.currency)}</p>)
              : formatMembershipPrice(0, "TND")}
          </div>
          <p className="text-xs text-muted mb-4">{data.payments.countThisMonth} paiement(s) enregistré(s)</p>
          <div className="space-y-2">
            {data.payments.recent.slice(0, 5).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                <span className="text-primary">{p.memberName}</span>
                <span className="text-muted">{formatMembershipPrice(p.amount, p.currency)} · {STATUS_LABEL[p.status] ?? p.status}</span>
              </div>
            ))}
            {data.payments.recent.length === 0 && <p className="text-sm text-muted">Aucun paiement récent.</p>}
          </div>
        </div>
      </div>

      {/* Owner-only: member growth + coach performance */}
      {isOwner && data.memberGrowth && data.coachPerformance && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h2 className="font-bold text-primary mb-4">Croissance des membres (6 mois)</h2>
            <div className="flex items-end justify-between gap-2 h-32">
              {data.memberGrowth.map((m) => {
                const max = Math.max(...data.memberGrowth!.map((x) => x.count), 1);
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full bg-emerald-500/70 rounded-t-lg"
                        style={{ height: `${Math.max((m.count / max) * 100, 2)}%` }}
                        title={`${m.count} nouveaux membres`}
                      />
                    </div>
                    <span className="text-xs text-muted">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Dumbbell size={18} className="text-[var(--primary)]" />
              <h2 className="font-bold text-primary">Performance des coachs (30j)</h2>
            </div>
            <div className="space-y-2">
              {data.coachPerformance.length === 0 ? (
                <p className="text-sm text-muted">Pas encore de présences enregistrées.</p>
              ) : (
                data.coachPerformance.map((c) => (
                  <div key={c.coach} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                    <span className="text-primary">{c.coach}</span>
                    <span className="text-muted">{c.attendances} présences</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Member reports ("signalements") panel ─────────────────────────────────────

interface MemberReport {
  id: string;
  subject: string;
  message: string;
  status: "PENDING" | "IN_PROGRESS" | "RESOLVED";
  adminNote: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string | null };
}

const STATUS_META: Record<MemberReport["status"], { label: string; className: string; Icon: typeof Clock }> = {
  PENDING: { label: "Nouveau", className: "bg-amber-500/10 text-amber-600 border-amber-500/30", Icon: Clock },
  IN_PROGRESS: { label: "En cours", className: "bg-blue-500/10 text-blue-600 border-blue-500/30", Icon: RotateCcw },
  RESOLVED: { label: "Résolu", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", Icon: CheckCircle2 },
};

function MemberReportsPanel() {
  const [reports, setReports] = useState<MemberReport[]>([]);
  const [countByStatus, setCountByStatus] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"ALL" | MemberReport["status"]>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter !== "ALL" ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/member-reports${qs}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        setReports(json.reports);
        setCountByStatus(json.countByStatus ?? {});
      } else {
        setError(json.error || "Erreur de chargement");
      }
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const updateStatus = async (id: string, status: MemberReport["status"], note?: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/member-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, ...(note !== undefined ? { adminNote: note } : {}) }),
      });
      if (res.ok) {
        setOpenId(null);
        fetchReports();
      }
    } finally {
      setSaving(false);
    }
  };

  const filters: { key: "ALL" | MemberReport["status"]; label: string }[] = [
    { key: "ALL", label: `Tous (${(countByStatus.PENDING ?? 0) + (countByStatus.IN_PROGRESS ?? 0) + (countByStatus.RESOLVED ?? 0)})` },
    { key: "PENDING", label: `Nouveaux (${countByStatus.PENDING ?? 0})` },
    { key: "IN_PROGRESS", label: `En cours (${countByStatus.IN_PROGRESS ?? 0})` },
    { key: "RESOLVED", label: `Résolus (${countByStatus.RESOLVED ?? 0})` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition ${
              filter === f.key
                ? "bg-[var(--primary)] border-[var(--primary)] text-white"
                : "border-border text-muted hover:border-[var(--primary)] hover:text-[var(--primary)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[30vh] gap-3 text-center">
          <AlertCircle size={24} className="text-danger" />
          <p className="text-muted text-sm">{error}</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 flex flex-col items-center text-center gap-3">
          <Flag size={24} className="text-muted" />
          <p className="text-sm text-muted">Aucun signalement pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const meta = STATUS_META[r.status];
            const isOpen = openId === r.id;
            return (
              <div key={r.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-primary">{r.subject}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${meta.className}`}>
                        <meta.Icon size={11} /> {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {r.user.name} · {r.user.email}
                      {r.user.phone ? ` · ${r.user.phone}` : ""} · {new Date(r.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <button
                    onClick={() => { setOpenId(isOpen ? null : r.id); setNoteDraft(r.adminNote ?? ""); }}
                    className="p-2 rounded-lg hover:bg-muted/40 text-muted flex-shrink-0"
                    title="Voir / traiter"
                  >
                    <MessageSquare size={16} />
                  </button>
                </div>

                <p className="text-sm text-[var(--text-primary)] mt-3 whitespace-pre-wrap">{r.message}</p>

                {r.adminNote && !isOpen && (
                  <p className="text-xs text-muted mt-2 italic">Note interne : {r.adminNote}</p>
                )}

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Note interne (visible par l'équipe uniquement)…"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-muted/20 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status !== "IN_PROGRESS" && (
                        <button
                          disabled={saving}
                          onClick={() => updateStatus(r.id, "IN_PROGRESS", noteDraft)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 disabled:opacity-50"
                        >
                          Marquer en cours
                        </button>
                      )}
                      {r.status !== "RESOLVED" && (
                        <button
                          disabled={saving}
                          onClick={() => updateStatus(r.id, "RESOLVED", noteDraft)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          Marquer résolu
                        </button>
                      )}
                      {r.status !== "PENDING" && (
                        <button
                          disabled={saving}
                          onClick={() => updateStatus(r.id, "PENDING", noteDraft)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-50"
                        >
                          Rouvrir
                        </button>
                      )}
                      <button
                        disabled={saving}
                        onClick={() => updateStatus(r.id, r.status, noteDraft)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted hover:text-primary disabled:opacity-50"
                      >
                        Enregistrer la note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
