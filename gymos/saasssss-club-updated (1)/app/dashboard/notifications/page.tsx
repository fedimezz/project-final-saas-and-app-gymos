"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, BellOff, CheckCheck, Trash2 } from "lucide-react";

import NotificationCard, { type NotificationItem } from "@/components/notifications/NotificationCard";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);


  const fetchNotifications = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch("/api/dashboard/notifications", {
          credentials: "include",
        });
        const json = await res.json();

        if (res.ok) {
          setNotifications(json.notifications);
          setUnreadCount(json.unreadCount);
        }
      } catch {
        // silently fail; the page will simply show an empty state
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch(`/api/dashboard/notifications/${id}/read`, {
        method: "PUT",
        credentials: "include",
      });
    } catch {
      // best-effort; a manual refresh will resync state if this fails
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const res = await fetch("/api/dashboard/notifications/read-all", {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) {
        setNotifications(previous);
      }
    } catch {
      setNotifications(previous);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    const previous = notifications;
    const wasUnread = previous.find((n) => n.id === id)?.isRead === false;

    setDeletingId(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(`/api/dashboard/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setNotifications(previous);
        if (wasUnread) setUnreadCount((prev) => prev + 1);
      }
    } catch {
      setNotifications(previous);
      if (wasUnread) setUnreadCount((prev) => prev + 1);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setClearingAll(true);
    const previous = notifications;
    setNotifications([]);
    setUnreadCount(0);
    setConfirmClearOpen(false);

    try {
      const res = await fetch("/api/dashboard/notifications/clear-all", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setNotifications(previous);
      }
    } catch {
      setNotifications(previous);
    } finally {
      setClearingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement des notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">Notifications</h1>
          <p className="mt-1 text-muted">
            {unreadCount > 0
              ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
              : "Vous êtes à jour."}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-2 px-4 py-2.5 text-sm bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 font-medium"
            >
              {markingAll ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CheckCheck size={16} />
              )}
              Tout marquer lu
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => setConfirmClearOpen(true)}
              disabled={clearingAll}
              className="flex items-center gap-2 px-4 py-2.5 text-sm border border-red-500/30 text-red-500 hover:bg-red-500/5 rounded-xl transition-colors disabled:opacity-50 font-medium"
            >
              {clearingAll ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Tout effacer
            </button>
          )}
          <button
            onClick={() => fetchNotifications(false)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2.5 text-sm bg-muted hover:bg-muted/70 rounded-xl transition-colors disabled:opacity-50 font-medium"
          >
            {isRefreshing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
          </button>
        </div>
      </div>

      {notifications.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <BellOff size={28} className="text-muted" />
          </div>
          <p className="text-muted text-center">Aucune notification pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
              isDeleting={deletingId === n.id}
            />
          ))}
        </div>
      )}

      {/* Confirmation dialog for "clear all" */}
      {confirmClearOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in"
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-primary mb-2">Effacer toutes les notifications ?</h3>
            <p className="text-sm text-muted mb-6">
              Cette action est définitive et supprimera vos {notifications.length} notification{notifications.length > 1 ? "s" : ""}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-primary hover:bg-muted transition-colors text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleClearAll}
                disabled={clearingAll}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-60"
              >
                {clearingAll ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                Effacer tout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
