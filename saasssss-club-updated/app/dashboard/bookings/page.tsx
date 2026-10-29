"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CalendarX, RefreshCw } from "lucide-react";

import BookingTabs, { type BookingTab } from "@/components/bookings/BookingTabs";
import BookingCard, { type Booking } from "@/components/bookings/BookingCard";

interface BookingsData {
  upcoming: Booking[];
  past: Booking[];
  cancelled: Booking[];
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in max-w-sm
        ${
          type === "success"
            ? "bg-card border-green-500/30 text-green-600 dark:text-green-400"
            : "bg-card border-red-500/30 text-red-600 dark:text-red-400"
        }`}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 opacity-50 hover:opacity-100 transition-opacity"
        aria-label="Fermer la notification"
      >
        ✕
      </button>
    </div>
  );
}

export default function BookingsPage() {
  const [data, setData] = useState<BookingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<BookingTab>("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);


  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  const fetchBookings = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch("/api/bookings", {
          credentials: "include",
        });
        const json = await res.json();

        if (res.ok) {
          setData(json);
        } else {
          showToast(json.error || "Erreur de chargement", "error");
        }
      } catch {
        showToast("Erreur serveur", "error");
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchBookings(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async (sessionId: string) => {
    setCancellingId(sessionId);
    try {
      const res = await fetch("/api/dashboard/schedule/book", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();

      if (res.ok) {
        showToast("Réservation annulée", "success");
        fetchBookings(false);
      } else {
        showToast(json.error || "Erreur d'annulation", "error");
      }
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement de vos réservations...</p>
        </div>
      </div>
    );
  }

  const counts = {
    upcoming: data?.upcoming.length ?? 0,
    past: data?.past.length ?? 0,
    cancelled: data?.cancelled.length ?? 0,
  };

  const currentList = data ? data[activeTab] : [];

  const emptyMessages: Record<BookingTab, string> = {
    upcoming: "Aucune réservation à venir. Direction le planning pour réserver une session !",
    past: "Aucun historique de session pour le moment.",
    cancelled: "Aucune réservation annulée.",
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">Mes Réservations</h1>
          <p className="mt-1 text-muted">Consultez et gérez vos sessions réservées.</p>
        </div>
        <button
          onClick={() => fetchBookings(false)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-muted hover:bg-muted/70 rounded-xl transition-colors disabled:opacity-50 font-medium self-start sm:self-auto"
        >
          {isRefreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {isRefreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <BookingTabs active={activeTab} onChange={setActiveTab} counts={counts} />

      {currentList.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <CalendarX size={28} className="text-muted" />
          </div>
          <p className="text-muted text-center max-w-sm">{emptyMessages[activeTab]}</p>
          {activeTab === "upcoming" && (
            <a
              href="/dashboard/schedule"
              className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
            >
              Voir le planning
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onCancel={activeTab === "upcoming" ? handleCancel : undefined}
              cancelling={cancellingId === booking.sessionId}
            />
          ))}
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
