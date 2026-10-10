"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ScrollText, RefreshCw, Filter, Download, Trash2,
  ChevronLeft, ChevronRight, Search, X, AlertCircle,
  Loader2, User, ShieldCheck, Crown, Cpu, Calendar,
  Activity, BookOpen, Users, CreditCard, Bell,
  Settings, FileText, Shield, Zap, Smartphone, Monitor,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import OwnerOnly from "@/components/admin/OwnerOnly";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  targetId: string | null;
  targetName: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Stats {
  totalToday: number;
  byCategory: { category: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "AUTH", "BOOKING", "MEMBER", "SESSION", "PAYMENT",
  "SUBSCRIPTION", "SETTINGS", "NOTIFICATION", "STAFF",
  "CONTENT", "REPORT", "SYSTEM",
] as const;

const ROLES = ["MEMBER", "COACH", "ADMIN", "OWNER", "SYSTEM"] as const;

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  AUTH:         { label: "Auth",           icon: Shield,    color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  BOOKING:      { label: "Réservation",    icon: BookOpen,  color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10" },
  MEMBER:       { label: "Membre",         icon: Users,     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  SESSION:      { label: "Séance",         icon: Activity,  color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10" },
  PAYMENT:      { label: "Paiement",       icon: CreditCard,color: "text-green-600 dark:text-green-400",   bg: "bg-green-500/10" },
  SUBSCRIPTION: { label: "Abonnement",     icon: CreditCard,color: "text-teal-600 dark:text-teal-400",     bg: "bg-teal-500/10" },
  SETTINGS:     { label: "Paramètres",     icon: Settings,  color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  NOTIFICATION: { label: "Notification",   icon: Bell,      color: "text-pink-600 dark:text-pink-400",     bg: "bg-pink-500/10" },
  STAFF:        { label: "Équipe",         icon: ShieldCheck,color:"text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
  CONTENT:      { label: "Contenu",        icon: FileText,  color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-500/10" },
  REPORT:       { label: "Signalement",    icon: AlertCircle,color:"text-red-600 dark:text-red-400",       bg: "bg-red-500/10" },
  SYSTEM:       { label: "Système",        icon: Cpu,       color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-500/10" },
};

const ROLE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  MEMBER: { icon: User,        color: "text-blue-500",   label: "Membre" },
  ADMIN:  { icon: ShieldCheck, color: "text-amber-500",  label: "Admin" },
  OWNER:  { icon: Crown,       color: "text-violet-500", label: "Owner" },
  SYSTEM: { icon: Cpu,         color: "text-gray-500",   label: "Système" },
  COACH:  { icon: Zap,         color: "text-emerald-500",label: "Coach" },
};

// Make an action slug readable
function prettifyAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)  return `il y a ${Math.floor(diff)}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ─── Log Row ──────────────────────────────────────────────────────────────────

function LogRow({ log, expanded, onToggle }: {
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cat = CATEGORY_META[log.category] ?? CATEGORY_META.SYSTEM;
  const CatIcon = cat.icon;
  const role = ROLE_META[log.actorRole ?? "SYSTEM"] ?? ROLE_META.SYSTEM;
  const RoleIcon = role.icon;
  const device = typeof log.detail?.device === "string" ? log.detail.device : null;
  const DeviceIcon = device === "PHONE" ? Smartphone : device === "COMPUTER" ? Monitor : null;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        {/* Category icon */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center mt-0.5`}>
          <CatIcon size={14} className={cat.color} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-primary truncate">
              {prettifyAction(log.action)}
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted flex-wrap">
            {log.actorName && (
              <span className="flex items-center gap-1">
                <RoleIcon size={11} className={role.color} />
                <span className={role.color + " font-medium"}>{log.actorName}</span>
                <span className="text-muted">({role.label})</span>
              </span>
            )}
            {DeviceIcon && (
              <span
                className="inline-flex items-center gap-1 text-muted"
                title={device === "PHONE" ? "Action depuis un téléphone" : "Action depuis un ordinateur"}
                aria-label={device === "PHONE" ? "Téléphone" : "Ordinateur"}
              >
                <DeviceIcon size={13} />
                <span>{device === "PHONE" ? "Téléphone" : "Ordinateur"}</span>
              </span>
            )}
            {log.targetName && (
              <span className="flex items-center gap-1">
                <span className="text-muted">→</span>
                <span className="text-primary font-medium truncate max-w-[160px]">{log.targetName}</span>
              </span>
            )}
            {log.ip && <span className="font-mono opacity-60">{log.ip}</span>}
          </div>
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-right">
          <span className="text-xs text-muted whitespace-nowrap">{timeAgo(log.createdAt)}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 ml-11">
          <div className="bg-muted/40 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-muted">
              <div>
                <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">Date exacte</span>
                <p className="font-mono mt-0.5">{formatFull(log.createdAt)}</p>
              </div>
              {log.actorId && (
                <div>
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">ID acteur</span>
                  <p className="font-mono mt-0.5 truncate">{log.actorId}</p>
                </div>
              )}
              {log.targetId && (
                <div>
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">ID cible</span>
                  <p className="font-mono mt-0.5 truncate">{log.targetId}</p>
                </div>
              )}
              {log.ip && (
                <div>
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">IP</span>
                  <p className="font-mono mt-0.5">{log.ip}</p>
                </div>
              )}
              {log.userAgent && (
                <div className="col-span-2">
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">User Agent</span>
                  <p className="mt-0.5 truncate opacity-70">{log.userAgent}</p>
                </div>
              )}
            </div>
            {log.detail && Object.keys(log.detail).length > 0 && (
              <div>
                <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">Détails</span>
                <pre className="mt-1 text-[11px] text-muted bg-card rounded-lg p-2.5 overflow-x-auto font-mono leading-relaxed">
                  {JSON.stringify(log.detail, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LogsContent() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 1 });
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback((p = page) => {
    const params = new URLSearchParams({ page: String(p), limit: "50" });
    if (search)    params.set("search",    search);
    if (category)  params.set("category",  category);
    if (actorRole) params.set("actorRole", actorRole);
    if (from)      params.set("from",      from);
    if (to)        params.set("to",        to);
    return params;
  }, [page, search, category, actorRole, from, to]);

  const fetchLogs = useCallback(async (p = page, showLoader = true) => {
    if (showLoader) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/logs?${buildParams(p).toString()}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        setLogs(json.logs);
        setPagination(json.pagination);
        setStats(json.stats);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildParams, page]);

  // refetch when filters change (reset to page 1)
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
     
  }, [search, category, actorRole, from, to]);

  useEffect(() => {
    fetchLogs(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, category, actorRole, from, to]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams(1);
      params.set("export", "1");
      const res = await fetch(`/api/admin/logs?${params.toString()}`, { credentials: "include" });
      const { logs: allLogs } = await res.json();

      const headers = ["Date", "Action", "Catégorie", "Acteur", "Rôle", "Cible", "IP", "Détails"];
      const rows = allLogs.map((l: LogEntry) => [
        formatFull(l.createdAt),
        l.action,
        l.category,
        l.actorName ?? "",
        l.actorRole ?? "",
        l.targetName ?? "",
        l.ip ?? "",
        l.detail ? JSON.stringify(l.detail) : "",
      ]);

      const csv = [headers, ...rows]
        .map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm("Supprimer tous les logs de plus de 90 jours ?")) return;
    setPurging(true);
    setPurgeResult(null);
    try {
      const res = await fetch("/api/admin/logs", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 90 }),
      });
      const json = await res.json();
      if (res.ok) {
        setPurgeResult(`${json.deleted} log${json.deleted !== 1 ? "s" : ""} supprimé${json.deleted !== 1 ? "s" : ""}`);
        fetchLogs(1, false);
        setPage(1);
      }
    } finally {
      setPurging(false);
    }
  };

  const clearFilters = () => {
    setSearch(""); setCategory(""); setActorRole(""); setFrom(""); setTo("");
  };

  const hasFilters = search || category || actorRole || from || to;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <ScrollText size={28} className="text-[var(--primary)]" />
            Journal d&apos;activité
          </h1>
          <p className="text-muted mt-1">Toutes les actions effectuées sur la plateforme.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLogs(page, false)}
            disabled={refreshing}
            className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors disabled:opacity-50"
            title="Actualiser"
          >
            <RefreshCw size={16} className={`text-muted ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/70 text-sm font-medium text-primary transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Exporter CSV
          </button>
          {isOwner && (
            <button
              onClick={handlePurge}
              disabled={purging}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-sm font-medium text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
            >
              {purging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Purger +90j
            </button>
          )}
        </div>
      </div>

      {purgeResult && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm">
          <Zap size={14} /> {purgeResult}
        </div>
      )}

      {/* Stats bar */}
      {stats && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-[var(--primary)]/10 rounded-xl">
            <Calendar size={13} className="text-[var(--primary)]" />
            <span className="text-xs font-semibold text-[var(--primary)]">
              {stats.totalToday} action{stats.totalToday !== 1 ? "s" : ""} aujourd&apos;hui
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {stats.byCategory.slice(0, 6).map(({ category: cat, count }) => {
              const meta = CATEGORY_META[cat];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(category === cat ? "" : cat)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                    ${category === cat ? `${meta.bg} ${meta.color}` : "bg-muted text-muted hover:bg-muted/70"}`}
                >
                  <Icon size={11} />
                  {meta.label} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          <span className="text-xs text-muted ml-auto">{pagination.total} entrées au total</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted">
          <Filter size={14} />
          Filtres
          {hasFilters && (
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-[var(--primary)] hover:underline">
              <X size={12} /> Effacer
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* Search */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Action, acteur, cible…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          >
            <option value="">Toutes catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</option>
            ))}
          </select>
          {/* Actor role */}
          <select
            value={actorRole}
            onChange={(e) => setActorRole(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          >
            <option value="">Tous les rôles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_META[r]?.label ?? r}</option>
            ))}
          </select>
          {/* Date range */}
          <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 px-2 py-2 rounded-xl border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <span className="text-muted text-xs">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 px-2 py-2 rounded-xl border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ScrollText size={28} className="text-muted opacity-40" />
            <p className="text-muted text-sm">Aucun log trouvé pour ces filtres.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-[var(--primary)] hover:underline">
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          logs.map((log) => (
            <LogRow
              key={log.id}
              log={log}
              expanded={expandedId === log.id}
              onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            Page {pagination.page} sur {pagination.pages} — {pagination.total} entrées
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              <ChevronLeft size={16} className="text-muted" />
            </button>
            {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
              const p = Math.min(
                Math.max(page - 2, 1) + i,
                pagination.pages
              );
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                    ${p === page ? "bg-[var(--primary)] text-white" : "hover:bg-muted text-muted"}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              <ChevronRight size={16} className="text-muted" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// Owner-only (enforced server-side too: proxy.ts + /api/admin/logs).
export default function LogsPage() {
  return (
    <OwnerOnly>
      <LogsContent />
    </OwnerOnly>
  );
}
