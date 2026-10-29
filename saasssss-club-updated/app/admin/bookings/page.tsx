"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Loader2, Search, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, X, Ban, Users, CalendarX2,
  Trash2, ArrowUpDown, ArrowUp, ArrowDown, Sparkles,
} from "lucide-react";

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio",
  CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates",
  BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym",
  PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};
const ACTIVITIES = Object.keys(ACTIVITY_LABELS);

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lundi", TUESDAY: "Mardi", WEDNESDAY: "Mercredi",
  THURSDAY: "Jeudi", FRIDAY: "Vendredi", SATURDAY: "Samedi", SUNDAY: "Dimanche",
};

type SortKey = "bookedAt" | "userName" | "activity";
type SortDir = "asc" | "desc";

interface Booking {
  id: string;
  bookedAt: string;
  isCancelled: boolean;
  cancelledAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    _count?: { userSessions: number };
  };
  session: {
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    coach: string;
    location: string;
    weeklyPlan: { weekStart: string; weekEnd: string };
  };
}

interface Stats { active: number; cancelled: number; total: number }

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm ${type === "success" ? "bg-card border-green-500/30 text-green-600 dark:text-green-400" : "bg-card border-red-500/30 text-red-600 dark:text-red-400"}`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) return <Image src={avatar} alt={name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />;
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] text-xs font-bold">
      {initials}
    </div>
  );
}

// ─── Sort icon ───────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={13} className="text-muted opacity-50" />;
  return sortDir === "asc"
    ? <ArrowUp size={13} className="text-[var(--primary)]" />
    : <ArrowDown size={13} className="text-[var(--primary)]" />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, cancelled: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activity, setActivity] = useState("");
  const [coach, setCoach] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [cancelled, setCancelled] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("bookedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [coaches, setCoaches] = useState<string[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [cleanConfirm, setCleanConfirm] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), sortKey, sortDir });
      if (search) params.set("search", search);
      if (activity) params.set("activity", activity);
      if (coach) params.set("coach", coach);
      if (weekStart) params.set("weekStart", weekStart);
      if (cancelled) params.set("cancelled", cancelled);

      const res = await fetch(`/api/admin/bookings?${params}`, {
        credentials: "include",
      });
      const text = await res.text();
      const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;

      if (res.ok && json) {
        setBookings(json.bookings ?? []);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setTotal(json.pagination?.total ?? 0);
        setStats(json.stats ?? { active: 0, cancelled: 0, total: 0 });
        setCoaches((prev) => {
          const all = new Set([...prev, ...((json.coaches as string[]) ?? [])]);
          return Array.from(all).sort();
        });
      } else {
        showToast(json?.error || `Erreur ${res.status}`, "error");
      }
    } catch {
      showToast("Erreur serveur lors du chargement", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, activity, coach, weekStart, cancelled, sortKey, sortDir]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleSort = (col: SortKey) => {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
    setPage(1);
  };

  const handleCancelBooking = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/bookings/${cancelTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "cancel" }),
      });
      const text = await res.text();
      const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (res.ok) {
        showToast(`Réservation de ${cancelTarget.user.name} annulée · membre prévenu`, "success");
        setCancelTarget(null);
        fetchBookings();
      } else {
        showToast(json?.error || `Erreur ${res.status}`, "error");
      }
    } catch { showToast("Erreur serveur", "error"); }
    finally { setCancelling(false); }
  };

  const handleDeleteBooking = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/bookings/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const text = await res.text();
      const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (res.ok) {
        showToast("Réservation supprimée définitivement", "success");
        setDeleteTarget(null);
        fetchBookings();
      } else {
        showToast(json?.error || `Erreur ${res.status}`, "error");
      }
    } catch { showToast("Erreur serveur", "error"); }
    finally { setDeleting(false); }
  };

  const handleCleanAll = async () => {
    setCleaning(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "DELETE",
        credentials: "include",
      });
      const text = await res.text();
      const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
      if (res.ok) {
        showToast(`${json?.deleted ?? 0} réservation(s) supprimée(s)`, "success");
        setCleanConfirm(false);
        fetchBookings();
      } else {
        showToast(json?.error || `Erreur ${res.status}`, "error");
      }
    } catch { showToast("Erreur serveur", "error"); }
    finally { setCleaning(false); }
  };

  const STATUS_FILTERS = [
    { value: "", label: "Toutes" },
    { value: "false", label: "Actives" },
    { value: "true", label: "Annulées" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Réservations</h1>
          <p className="text-muted mt-1">
            {total} réservation{total !== 1 ? "s" : ""}{" "}
            {(search || activity || coach || weekStart || cancelled) ? "trouvée" + (total !== 1 ? "s" : "") : "au total"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {stats.cancelled > 0 && (
            <button
              onClick={() => setCleanConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-semibold transition-colors"
            >
              <Sparkles size={15} />
              Nettoyer ({stats.cancelled})
            </button>
          )}
          <button onClick={fetchBookings} className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors">
            <RefreshCw size={17} className="text-muted" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
            <Users size={18} className="text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-xl font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-muted">Total filtré</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-500">{stats.active}</p>
            <p className="text-xs text-muted">Actives</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <CalendarX2 size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-xl font-bold text-red-500">{stats.cancelled}</p>
            <p className="text-xs text-muted">Annulées</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom ou email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition text-sm"
            />
            {searchInput && (
              <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={activity}
            onChange={(e) => { setActivity(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition"
          >
            <option value="">Toutes les activités</option>
            {ACTIVITIES.map((a) => <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>)}
          </select>

          <select
            value={coach}
            onChange={(e) => { setCoach(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition"
          >
            <option value="">Tous les coachs</option>
            {coaches.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted whitespace-nowrap">Semaine du :</label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => { setWeekStart(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl bg-card border border-border text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition"
            />
            {weekStart && (
              <button onClick={() => { setWeekStart(""); setPage(1); }} className="text-muted hover:text-primary">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-1 p-1 bg-muted rounded-xl ml-auto">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setCancelled(f.value); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${cancelled === f.value ? "bg-card text-primary shadow-sm" : "text-muted hover:text-primary"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 text-muted">Aucune réservation trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("userName")} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                      Membre <SortIcon col="userName" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">Session</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">Coach</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">Semaine</th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("activity")} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                      Activité <SortIcon col="activity" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">
                    <button onClick={() => handleSort("bookedAt")} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                      Réservé le <SortIcon col="bookedAt" sortKey={sortKey} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">Statut</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={b.user.name} avatar={b.user.avatar} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-primary text-sm">{b.user.name}</p>
                            {b.user._count?.userSessions != null && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                                {b.user._count.userSessions} rés.
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted">{b.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-primary">{DAY_LABELS[b.session.day] ?? b.session.day}</p>
                      <p className="text-xs text-muted">{b.session.startTime} – {b.session.endTime} · {b.session.location}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-primary whitespace-nowrap">{b.session.coach}</td>
                    <td className="px-5 py-4 text-xs text-muted whitespace-nowrap">
                      {new Date(b.session.weeklyPlan.weekStart).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(b.session.weeklyPlan.weekEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                        {ACTIVITY_LABELS[b.session.activity] ?? b.session.activity}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted">
                      {new Date(b.bookedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-4">
                      {b.isCancelled ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                          <XCircle size={14} /> Annulée
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                          <CheckCircle2 size={14} /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {!b.isCancelled && (
                          <button
                            onClick={() => setCancelTarget(b)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
                          >
                            <Ban size={13} /> Annuler
                          </button>
                        )}
                        {b.isCancelled && (
                          <button
                            onClick={() => setDeleteTarget(b)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Supprimer définitivement"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border">
            <p className="text-sm text-muted">Page {page} sur {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-muted disabled:opacity-40">
                <ChevronLeft size={16} className="text-primary" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-muted disabled:opacity-40">
                <ChevronRight size={16} className="text-primary" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal : Annuler ───────────────────────────────────────────────── */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => !cancelling && setCancelTarget(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Annuler cette réservation ?</h3>
            <p className="text-sm text-muted mb-1">
              <span className="font-semibold text-primary">{cancelTarget.user.name}</span> — {ACTIVITY_LABELS[cancelTarget.session.activity] ?? cancelTarget.session.activity}
            </p>
            <p className="text-sm text-muted mb-4">
              {DAY_LABELS[cancelTarget.session.day] ?? cancelTarget.session.day}, {cancelTarget.session.startTime}–{cancelTarget.session.endTime} avec {cancelTarget.session.coach}
            </p>
            <p className="text-sm text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-4">
              Le membre recevra une notification d&apos;annulation.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCancelTarget(null)} disabled={cancelling} className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50">
                Retour
              </button>
              <button onClick={handleCancelBooking} disabled={cancelling} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-60">
                {cancelling ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                Annuler la réservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Supprimer définitivement ─────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Supprimer définitivement ?</h3>
            <p className="text-sm text-muted mb-4">
              La réservation annulée de <span className="font-semibold text-primary">{deleteTarget.user.name}</span> sera effacée de la base de données. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleDeleteBooking} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-60">
                {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Nettoyer ─────────────────────────────────────────────── */}
      {cleanConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in" onClick={() => !cleaning && setCleanConfirm(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-primary mb-2">Nettoyer les réservations annulées ?</h3>
            <p className="text-sm text-muted mb-4">
              Les <span className="font-semibold text-primary">{stats.cancelled}</span> réservation(s) annulée(s) seront supprimées définitivement. Cette action est irréversible.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setCleanConfirm(false)} disabled={cleaning} className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleCleanAll} disabled={cleaning} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-semibold disabled:opacity-60">
                {cleaning ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Tout nettoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}