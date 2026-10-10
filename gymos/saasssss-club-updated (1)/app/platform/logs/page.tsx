"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2, ChevronLeft, ChevronRight, RefreshCw, Filter,
  Search, X, ScrollText, Calendar, Activity, Shield,
  CreditCard, Users, Settings, Bell, FileText, AlertCircle,
  Cpu, BookOpen, Building2, Zap,
} from "lucide-react";

interface LogEntry {
  id: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  targetName: string | null;
  createdAt: string;
  club: { name: string; slug: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const CATEGORIES = ["AUTH", "SUBSCRIPTION", "SYSTEM", "MEMBER", "PAYMENT", "SETTINGS", "BOOKING", "NOTIFICATION", "STAFF", "CONTENT", "REPORT"];

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  AUTH:         { label: "Auth",          icon: Shield,      color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  BOOKING:      { label: "Réservation",   icon: BookOpen,    color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10" },
  MEMBER:       { label: "Membre",        icon: Users,       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  PAYMENT:      { label: "Paiement",      icon: CreditCard,  color: "text-green-600 dark:text-green-400",   bg: "bg-green-500/10" },
  SUBSCRIPTION: { label: "Abonnement",    icon: CreditCard,  color: "text-teal-600 dark:text-teal-400",     bg: "bg-teal-500/10" },
  SETTINGS:     { label: "Paramètres",    icon: Settings,    color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  NOTIFICATION: { label: "Notification",  icon: Bell,        color: "text-pink-600 dark:text-pink-400",     bg: "bg-pink-500/10" },
  STAFF:        { label: "Équipe",        icon: Zap,         color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
  CONTENT:      { label: "Contenu",       icon: FileText,    color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-500/10" },
  REPORT:       { label: "Signalement",   icon: AlertCircle, color: "text-red-600 dark:text-red-400",       bg: "bg-red-500/10" },
  SYSTEM:       { label: "Système",       icon: Cpu,         color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-500/10" },
};

function prettifyAction(action: string): string {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return `il y a ${Math.floor(diff)}s`;
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

function formatFull(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function LogRow({ log, expanded, onToggle }: {
  log: LogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cat = CATEGORY_META[log.category] ?? CATEGORY_META.SYSTEM;
  const CatIcon = cat.icon;

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${cat.bg} flex items-center justify-center mt-0.5`}>
          <CatIcon size={14} className={cat.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-primary">{prettifyAction(log.action)}</span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
            {log.club && (
              <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Building2 size={10} />
                {log.club.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted flex-wrap">
            {log.actorName && (
              <span className="font-medium text-primary">{log.actorName}</span>
            )}
            {log.actorRole && (
              <span className="opacity-60">({log.actorRole})</span>
            )}
            {log.targetName && (
              <span className="flex items-center gap-1">
                <span className="text-muted">→</span>
                <span className="text-primary font-medium truncate max-w-[160px]">{log.targetName}</span>
              </span>
            )}
          </div>
        </div>

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
              {log.club && (
                <div>
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">Club</span>
                  <p className="font-mono mt-0.5">{log.club.name} ({log.club.slug})</p>
                </div>
              )}
              {log.actorRole && (
                <div>
                  <span className="font-semibold text-primary uppercase tracking-wide text-[10px]">Rôle acteur</span>
                  <p className="mt-0.5">{log.actorRole}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlatformLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, totalPages: 1 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [totalToday, setTotalToday] = useState<number | null>(null);

  const load = useCallback(async (p = page, showLoader = true) => {
    if (showLoader) setLoading(true); else setRefreshing(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (category) params.set("category", category);
      if (search)   params.set("search", search);
      const res = await fetch(`/api/platform/logs?${params}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs);
        setPagination(json.pagination);
        if (json.totalToday !== undefined) setTotalToday(json.totalToday);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, category, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
   
  }, [category, search]);

  useEffect(() => { load(page); }, [page, category, search, load]);

  const hasFilters = !!category || !!search;
  const clearFilters = () => { setCategory(""); setSearch(""); };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <ScrollText size={28} className="text-emerald-500" />
            Journal de la plateforme
          </h1>
          <p className="text-muted mt-1">Toutes les actions cross-tenant de la plateforme.</p>
        </div>
        <button
          onClick={() => load(page, false)}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors disabled:opacity-50 self-start"
          title="Actualiser"
        >
          <RefreshCw size={16} className={`text-muted ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats bar */}
      {totalToday !== null && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 rounded-xl">
            <Calendar size={13} className="text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {totalToday} action{totalToday !== 1 ? "s" : ""} aujourd&apos;hui
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {CATEGORIES.slice(0, 6).map((c) => {
              const meta = CATEGORY_META[c];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(category === c ? "" : c)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                    ${category === c ? `${meta.bg} ${meta.color}` : "bg-muted text-muted hover:bg-muted/70"}`}
                >
                  <Icon size={11} />
                  {meta.label}
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
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-xs text-emerald-500 hover:underline">
              <X size={12} /> Effacer
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Action, acteur, club…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          {/* Category */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <option value="">Toutes catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Log list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-emerald-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Activity size={28} className="text-muted opacity-40" />
            <p className="text-muted text-sm">Aucun log trouvé pour ces filtres.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-emerald-500 hover:underline">
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
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            Page {pagination.page} sur {pagination.totalPages} — {pagination.total} entrées
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
            >
              <ChevronLeft size={16} className="text-muted" />
            </button>
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              const p = Math.min(Math.max(page - 2, 1) + i, pagination.totalPages);
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                    ${p === page ? "bg-emerald-500 text-white" : "hover:bg-muted text-muted"}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
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