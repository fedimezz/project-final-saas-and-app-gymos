"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Dumbbell,
  Trophy,
  CreditCard,
  TrendingUp,
  Loader2,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import StatsCard from "@/components/dashboard/StatsCard";
import UpcomingSession from "@/components/dashboard/UpcomingSession";
import MembershipCard from "@/components/dashboard/MembershipCard";
import NotificationList from "@/components/dashboard/NotificationList";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation",
  FITNESS: "Fitness",
  CARDIO: "Cardio",
  CROSSFIT: "CrossFit",
  YOGA: "Yoga",
  PILATES: "Pilates",
  BOXE: "Boxe",
  MMA: "MMA",
  AQUAGYM: "Aquagym",
  PADEL: "Padel",
  ZUMBA: "Zumba",
  SPINNING: "Spinning",
};

interface DashboardData {
  userName: string;
  stats: {
    totalBookings: number;
    completedAttendances: number;
    membershipStatus: "Active" | "Inactive";
    daysUntilExpiry: number | null;
    planName: string | null;
  };
  upcomingSession: {
    activity: string;
    day: string;
    startTime: string;
    endTime: string;
    coach: string;
    location: string;
  } | null;
  weeklyActivity: number[];
  recentAttendances: {
    id: string;
    activity: string | null;
    checkInTime: string;
  }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const { userRole, logout } = useAuth();
  const isCoach = userRole?.toUpperCase() === "COACH";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (signal?: AbortSignal) => {
    // Hard stop so a slow/hung API can never leave the page on the spinner:
    // after 15s the user gets the error state with a retry button instead.
    const timeoutCtl = new AbortController();
    const timer = window.setTimeout(() => timeoutCtl.abort(), 15000);
    signal?.addEventListener("abort", () => timeoutCtl.abort(), { once: true });
    try {
      const res = await fetch("/api/dashboard", {
        credentials: "include",
        cache: "no-store",
        signal: timeoutCtl.signal,
      });

      if (res.status === 401) {
        // Session expired/revoked while the page was open: drop the client
        // mirror and go to the login page instead of showing a dead dashboard.
        logout();
        router.replace("/user/login");
        return;
      }

      const json = await res.json().catch(() => null);
      if (signal?.aborted) return;

      if (res.ok && json) {
        setData(json);
        setError(null);
      } else {
        setError(json?.error || "Erreur de chargement");
      }
    } catch {
      if (signal?.aborted) return; // unmounted — nothing to update
      setError(timeoutCtl.signal.aborted ? "Le serveur met trop de temps à répondre." : "Erreur serveur");
    } finally {
      window.clearTimeout(timer);
      if (!signal?.aborted) setLoading(false);
    }
  }, [logout, router]);

  useEffect(() => {
    // Coaches have their own dedicated dashboard (their schedule +
    // attendance tools) — this generic member view (bookings, membership
    // card, etc.) doesn't apply to them.
    if (isCoach) {
      router.replace("/dashboard/coach");
      return;
    }
    const controller = new AbortController();
    fetchDashboard(controller.signal);
    return () => controller.abort();
  }, [isCoach, router, fetchDashboard]);

  if (isCoach || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted">{error || "Impossible de charger les données."}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            fetchDashboard();
          }}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-4xl font-bold text-primary">
          Bienvenue {data.userName.split(" ")[0]} 👋
        </h1>
        <p className="mt-2 text-muted">
          Suivez vos activités et restez motivé.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Réservations"
          value={String(data.stats.totalBookings)}
          icon={Calendar}
        />
        <StatsCard
          title="Présences"
          value={String(data.stats.completedAttendances)}
          icon={Dumbbell}
        />
        <StatsCard
          title="Adhésion"
          value={data.stats.membershipStatus === "Active" ? "Active" : "Inactive"}
          icon={CreditCard}
          subtitle={
            data.stats.daysUntilExpiry !== null
              ? `Expire dans ${data.stats.daysUntilExpiry} jours`
              : undefined
          }
        />
        <StatsCard
          title="Activité"
          value={`${Math.max(...data.weeklyActivity, 0)}%`}
          icon={Trophy}
          subtitle="Pic cette semaine"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <UpcomingSession session={data.upcomingSession} />

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-[var(--primary)]" />
              Activité hebdomadaire
            </h3>
            <div className="space-y-3">
              {DAYS.map((day, idx) => (
                <div key={day} className="flex items-center gap-2">
                  <span className="text-sm text-muted w-10">{day}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full transition-all"
                      style={{ width: `${data.weeklyActivity[idx]}%` }}
                    />
                  </div>
                  <span className="text-sm text-primary w-10 text-right">
                    {data.weeklyActivity[idx]}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <MembershipCard
          planName={data.stats.planName}
          daysUntilExpiry={data.stats.daysUntilExpiry}
          isActive={data.stats.membershipStatus === "Active"}
        />
      </div>

      {data.recentAttendances.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-primary mb-4">Présences récentes</h3>
          <div className="space-y-3">
            {data.recentAttendances.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <span className="text-sm text-primary">
                  {a.activity ? ACTIVITY_LABELS[a.activity] ?? a.activity : "Présence libre"}
                </span>
                <span className="text-xs text-muted">
                  {new Date(a.checkInTime).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <NotificationList />
    </div>
  );
}
