"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users, CreditCard, CalendarDays, BookOpen,
  Bell, Newspaper, TrendingUp, Palette, Clock, Loader2,
  ArrowRight, AlertCircle, XCircle, Dumbbell,
  ShieldCheck, UserCog, Zap, AlertTriangle,
} from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import DemoModeBanner from "@/components/admin/DemoModeBanner";
import SetupChecklist from "@/components/admin/SetupChecklist";
import { useAuth } from "@/context/AuthContext";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import { useDaysUntil } from "@/hooks/useDaysUntil";

interface SaasPlan {
  tier: string;
  name: string;
  priceMonthly: number;
  limits: Record<string, number>;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { members: number; coaches: number; admins: number };
}

interface Stats {
  totalMembers: number;
  activeMembers: number;
  newMembersThisMonth: number;
  activeSubscriptions: number;
  pendingSubscriptions: number;
  expiredSubscriptions: number;
  totalSessionsBooked: number;
  attendancesToday: number;
  unreadNotifications: number;
  revenueByCurrency: { currency: string; amount: number }[];
  totalCoaches: number;
  totalAdmins: number;
  todaysReservations: number;
  todaysClasses: number;
  saasPlan: SaasPlan | null;
  clubStatus: {
    name: string;
    slug: string;
    status: string;
    trialEndsAt: string | null;
  } | null;
}

const ADMIN_QUICK_ACTIONS = [
  { label: "Ajouter un membre",    href: "/admin/members",       icon: Users },
  { label: "Gérer le planning",     href: "/admin/schedule",      icon: CalendarDays },
  { label: "Valider abonnements",   href: "/admin/subscriptions", icon: CreditCard },
  { label: "Publier une annonce",   href: "/admin/news",          icon: Newspaper },
  { label: "Envoyer notification",  href: "/admin/notifications", icon: Bell },
  { label: "Voir réservations",     href: "/admin/bookings",      icon: BookOpen },
];

const OWNER_QUICK_ACTIONS = [
  ...ADMIN_QUICK_ACTIONS,
  { label: "Gérer les admins",      href: "/admin/staff",         icon: UserCog },
  { label: "Demander un thème",      href: "/admin/theme-requests", icon: Palette },
];

function fmt(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return "0";
  return value.toLocaleString("fr-FR");
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-[var(--primary)]";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span className={pct >= 90 ? "text-red-500 font-semibold" : ""}>{used} / {limit === -1 ? "∞" : limit}</span>
      </div>
      {limit !== -1 && (
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function ClubStatusCard({
  clubStatus,
}: {
  clubStatus: NonNullable<Stats["clubStatus"]>;
}) {
  const trialEnd = clubStatus.trialEndsAt;
  const daysLeft = useDaysUntil(trialEnd);
  const statusLabel: Record<string, string> = {
    TRIAL: "Essai gratuit",
    ACTIVE: "Actif",
    SUSPENDED: "Suspendu",
    CANCELLED: "Annulé",
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
      <h3 className="font-semibold text-primary">{clubStatus.name || "Mon club"}</h3>
      <p className="text-xs text-muted font-mono">{clubStatus.slug}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          {statusLabel[clubStatus.status] ?? clubStatus.status}
        </span>
      </div>
      {clubStatus.status === "TRIAL" && trialEnd !== null && daysLeft !== null && (
        <p className="text-sm text-amber-600">
          Essai gratuit — expire dans {daysLeft} jour{daysLeft !== 1 ? "s" : ""}
        </p>
      )}
      <Link
        href="/admin/billing"
        className="inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Gérer mon abonnement <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function SaasPlanWidget({
  plan,
  clubStatus,
}: {
  plan: SaasPlan;
  clubStatus: Stats["clubStatus"];
}) {
  const isTrial = plan.status === "TRIALING";
  const trialEnd = clubStatus?.trialEndsAt ?? null;
  const daysLeft = useDaysUntil(trialEnd);

  const tierColor: Record<string, string> = {
    STARTER: "text-blue-500 bg-blue-500/10",
    PRO: "text-purple-500 bg-purple-500/10",
    BUSINESS: "text-amber-500 bg-amber-500/10",
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[var(--primary)]" />
          <h3 className="font-semibold text-primary">Plan SaaS</h3>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tierColor[plan.tier] ?? "text-muted bg-border"}`}>
          {plan.name}
        </span>
      </div>

      {isTrial && trialEnd !== null && (
        <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${
          daysLeft <= 3 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"
        }`}>
          <AlertTriangle size={14} />
          <span>Période d&apos;essai — {daysLeft} jour{daysLeft !== 1 ? "s" : ""} restant{daysLeft !== 1 ? "s" : ""}</span>
        </div>
      )}

      {plan.cancelAtPeriodEnd && !isTrial && (
        <div className="flex items-center gap-2 text-xs bg-red-500/10 text-red-600 rounded-xl px-3 py-2">
          <AlertTriangle size={14} />
          <span>Résiliation programmée à la fin de la période</span>
        </div>
      )}

      <div className="space-y-3">
        {plan.limits.maxMembers !== undefined && (
          <UsageBar
            label="Membres actifs"
            used={plan.usage.members}
            limit={plan.limits.maxMembers}
          />
        )}
        {plan.limits.maxCoaches !== undefined && (
          <UsageBar
            label="Coachs"
            used={plan.usage.coaches}
            limit={plan.limits.maxCoaches}
          />
        )}
        {plan.limits.maxAdmins !== undefined && (
          <UsageBar
            label="Admins"
            used={plan.usage.admins}
            limit={plan.limits.maxAdmins}
          />
        )}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-xs text-muted">
          {plan.priceMonthly === 0 ? "Gratuit" : `${plan.priceMonthly} ${plan.limits.currency ?? "USD"}/mois`}
        </span>
        <Link
          href="/admin/billing"
          className="text-xs font-medium text-[var(--primary)] hover:underline"
        >
          Gérer mon abonnement →
        </Link>
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { userRole } = useAuth();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Erreur de chargement"); return; }
      setStats({
        totalMembers:         Number(json.totalMembers         ?? 0),
        activeMembers:        Number(json.activeMembers        ?? 0),
        newMembersThisMonth:  Number(json.newMembersThisMonth  ?? 0),
        activeSubscriptions:  Number(json.activeSubscriptions  ?? 0),
        pendingSubscriptions: Number(json.pendingSubscriptions ?? 0),
        expiredSubscriptions: Number(json.expiredSubscriptions ?? 0),
        totalSessionsBooked:  Number(json.totalSessionsBooked  ?? 0),
        attendancesToday:     Number(json.attendancesToday     ?? 0),
        unreadNotifications:  Number(json.unreadNotifications  ?? 0),
        revenueByCurrency:    Array.isArray(json.revenueByCurrency) ? json.revenueByCurrency : [],
        totalCoaches:         Number(json.totalCoaches         ?? 0),
        totalAdmins:          Number(json.totalAdmins          ?? 0),
        todaysReservations:   Number(json.todaysReservations   ?? 0),
        todaysClasses:        Number(json.todaysClasses        ?? 0),
        saasPlan:             json.saasPlan ?? null,
        clubStatus:           json.clubStatus ?? null,
      });
    } catch {
      setError("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center">
          <AlertCircle size={28} className="text-danger" />
        </div>
        <p className="text-muted text-center">{error || "Impossible de charger les données."}</p>
        <button
          onClick={fetchStats}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const quickActions = isOwner ? OWNER_QUICK_ACTIONS : ADMIN_QUICK_ACTIONS;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Getting-started checklist — shown until branding/plans/coaches/schedule are set up, dismissible */}
      <SetupChecklist />

      {/* Demo mode banner — shown to owners when the club is on trial */}
      {isOwner && stats.clubStatus?.status === "TRIAL" && (
        <DemoModeBanner trialEndsAt={stats.clubStatus.trialEndsAt ?? null} />
      )}

      <div>
        <h1 className="text-3xl font-bold text-primary">Vue d&apos;ensemble</h1>
        <p className="text-muted mt-1">
          {isOwner ? "Vue d'ensemble business du club." : "Tableau de bord opérationnel du club."}
        </p>
      </div>

      {/* Main grid: KPIs left, SaaS widget right (owner only) */}
      <div className={`grid gap-8 ${isOwner ? "xl:grid-cols-[1fr_300px]" : ""}`}>
        <div className="space-y-8">
          {/* KPI cards */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Membres actifs"
              value={fmt(stats.activeMembers)}
              icon={Users}
              color="blue"
              subtitle={`Sur ${fmt(stats.totalMembers)} inscrits`}
              trend={{ value: `+${stats.newMembersThisMonth} ce mois`, up: true }}
            />
            <StatCard
              title="Abonnements actifs"
              value={fmt(stats.activeSubscriptions)}
              icon={CreditCard}
              color="purple"
              subtitle={stats.pendingSubscriptions > 0 ? `${stats.pendingSubscriptions} en attente` : "Tous à jour"}
            />
            <StatCard
              title="Abonnements expirés"
              value={fmt(stats.expiredSubscriptions)}
              icon={XCircle}
              color="red"
            />
            <StatCard
              title="Présences aujourd'hui"
              value={fmt(stats.attendancesToday)}
              icon={Clock}
              color="amber"
            />
            <StatCard
              title="Réservations aujourd'hui"
              value={fmt(stats.todaysReservations)}
              icon={BookOpen}
              color="blue"
            />
            <StatCard
              title="Cours aujourd'hui"
              value={fmt(stats.todaysClasses)}
              icon={Dumbbell}
              color="green"
            />
            <StatCard
              title="Notifications non lues"
              value={fmt(stats.unreadNotifications)}
              icon={Bell}
              color="red"
            />

            {/* Owner-only business KPIs */}
            {isOwner && (
              <>
                <StatCard
                  title="Revenus ce mois"
                  value={stats.revenueByCurrency.length
                    ? stats.revenueByCurrency.map((entry) => formatMembershipPrice(entry.amount, entry.currency)).join(" · ")
                    : formatMembershipPrice(0, "TND")}
                  icon={TrendingUp}
                  color="green"
                />
                <StatCard
                  title="Total coachs"
                  value={fmt(stats.totalCoaches)}
                  icon={Dumbbell}
                  color="purple"
                />
                <StatCard
                  title="Total admins"
                  value={fmt(stats.totalAdmins)}
                  icon={ShieldCheck}
                  color="blue"
                />
              </>
            )}
          </div>

          {/* Pending subscriptions alert */}
          {stats.pendingSubscriptions > 0 && (
            <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <CreditCard size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-primary">
                    {stats.pendingSubscriptions} abonnement{stats.pendingSubscriptions > 1 ? "s" : ""} en attente
                  </p>
                  <p className="text-sm text-muted">Des membres attendent la validation de leur paiement.</p>
                </div>
              </div>
              <Link
                href="/admin/subscriptions?status=PENDING"
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap"
              >
                Valider <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* Quick actions */}
          <div>
            <h2 className="text-lg font-bold text-primary mb-4">Actions rapides</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="flex items-center gap-4 p-5 bg-card border border-border rounded-2xl hover:shadow-md hover:border-[var(--primary)]/30 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center group-hover:bg-[var(--primary)]/20 transition-colors">
                      <Icon size={20} className="text-[var(--primary)]" />
                    </div>
                    <span className="font-medium text-primary">{action.label}</span>
                    <ArrowRight size={16} className="ml-auto text-muted group-hover:text-primary transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* SaaS plan sidebar — owner only */}
        {isOwner && (
          <div className="space-y-4">
            {stats.clubStatus && <ClubStatusCard clubStatus={stats.clubStatus} />}
            {stats.saasPlan ? (
              <SaasPlanWidget plan={stats.saasPlan} clubStatus={stats.clubStatus} />
            ) : (
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={18} className="text-[var(--primary)]" />
                  <h3 className="font-semibold text-primary">Plan SaaS</h3>
                </div>
                <p className="text-sm text-muted mb-4">Aucun plan SaaS actif pour ce club.</p>
                <Link
                  href="/user/onboarding"
                  className="block w-full text-center py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--primary-dark)] transition-colors"
                >
                  Choisir un plan
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
