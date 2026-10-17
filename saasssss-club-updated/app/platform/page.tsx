"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, DollarSign, Users, AlertTriangle, ArrowRight, Loader2, RefreshCw,
  CreditCard, Briefcase, Globe, Palette,
} from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import { formatMembershipPrice } from "@/lib/payment-currencies";

interface Overview {
  clubs: { total: number; trial: number; active: number; suspended: number; cancelled: number; pendingPayment: number };
  mrr: Record<string, number>;
  revenue30d: Record<string, number>;
  totalMembers: number;
  trialEndingSoon: number;
  recentClubs: { id: string; name: string; slug: string; status: string; createdAt: string }[];
  queue: { serviceRequests: number; domainRequests: number; websiteRequests: number };
}

const STATUS_STYLE: Record<string, string> = {
  TRIAL: "bg-sky-500/10 text-sky-500",
  ACTIVE: "bg-emerald-500/10 text-emerald-500",
  SUSPENDED: "bg-rose-500/10 text-rose-500",
  CANCELLED: "bg-slate-500/10 text-slate-500",
};

const STATUS_TILES = [
  { key: "active", label: "Actifs" },
  { key: "trial", label: "Essai" },
  { key: "pendingPayment", label: "Paiement en attente" },
  { key: "suspended", label: "Suspendus" },
  { key: "cancelled", label: "Annulés" },
] as const;

// { USD: 120, TND: 300 } -> "120 $US · 300 TND" (never sum different currencies).
function formatMoney(byCurrency: Record<string, number>): string {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return "0";
  return entries.map(([currency, amount]) => formatMembershipPrice(amount, currency)).join(" · ");
}

export default function PlatformOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    if (fresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/platform/overview${fresh ? "?refresh=1" : ""}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Erreur de chargement");
      setData(await res.json());
      setError(null);
    } catch {
      setError("Impossible de charger les statistiques de la plateforme.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-500">{error ?? "Erreur inconnue"}</p>
        <button onClick={() => { setLoading(true); void load(true); }} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-primary hover:bg-muted/40">
          Réessayer
        </button>
      </div>
    );
  }

  const queueItems = [
    { label: "Services à traiter", count: data.queue.serviceRequests, href: "/platform/service-requests", icon: Briefcase },
    { label: "Domaines à configurer", count: data.queue.domainRequests, href: "/platform/service-requests", icon: Globe },
    { label: "Modifications de site", count: data.queue.websiteRequests, href: "/platform/website-requests", icon: Palette },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-primary">Vue d&apos;ensemble</h2>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-primary hover:bg-muted/40 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>
      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Clubs total" value={String(data.clubs.total)} icon={Building2} color="blue" />
        <StatCard title="MRR" value={formatMoney(data.mrr)} icon={DollarSign} color="green" />
        <StatCard title="Encaissé (30 j)" value={formatMoney(data.revenue30d)} icon={CreditCard} color="green" />
        <StatCard title="Membres (plateforme)" value={String(data.totalMembers)} icon={Users} color="purple" />
      </div>

      {data.trialEndingSoon > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-600">
          <AlertTriangle className="h-4 w-4" /> {data.trialEndingSoon} essai(s) expirent dans moins de 3 jours.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {STATUS_TILES.map(({ key, label }) => (
          <div key={key} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p>
            <p className="mt-1 text-xl font-black text-primary">{data.clubs[key]}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {queueItems.map(({ label, count, href, icon: Icon }) => (
          <Link key={label} href={href} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition hover:bg-muted/60">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-[var(--primary)]" />
              <span className="text-xs font-bold text-primary">{label}</span>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-black ${count > 0 ? "bg-amber-500/15 text-amber-600" : "bg-muted/40 text-muted"}`}>{count}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-extrabold text-primary">Clubs récents</h3>
          <Link href="/platform/clubs" className="flex items-center gap-1 text-xs font-bold text-emerald-500 hover:underline">
            Voir tous <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {data.recentClubs.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-muted">Aucun club pour le moment.</p>
          ) : (
            data.recentClubs.map((club) => (
              <Link
                key={club.id}
                href={`/platform/clubs/${club.id}`}
                className="flex items-center justify-between px-5 py-3.5 transition hover:bg-muted/60"
              >
                <div>
                  <p className="text-xs font-bold text-primary">{club.name}</p>
                  <p className="text-[10px] text-muted">{club.slug}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[club.status] ?? ""}`}>
                  {club.status}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
