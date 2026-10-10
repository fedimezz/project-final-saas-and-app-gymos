// src/hooks/useRealtimeNotifications.ts
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export interface LiveNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data?: Record<string, unknown> | null;
  sentAt: string;
  readAt: string | null;
}

export function useRealtimeNotifications() {
  const { isLoggedIn } = useAuth();
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  // Initial load: whatever the member already has from before this tab
  // was open (page refresh, or notifications sent while they were
  // offline). SSE only delivers events that happen WHILE connected — it
  // is not a substitute for fetching history.
  const fetchExisting = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/notifications", {
        credentials: "include",
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications ?? []);
      }
    } catch {
      // Non-fatal — bell just starts empty and live events still work.
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      return;
    }

    fetchExisting();

    // EventSource can't send custom headers, but same-origin requests
    // send cookies automatically, so the httpOnly auth cookie reaches
    // /api/sse without any token needing to travel in the URL.
    const source = new EventSource(`/api/sse`);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);

    source.addEventListener("notification", (e) => {
      const notification = JSON.parse((e as MessageEvent).data) as LiveNotification;
      setNotifications((prev) => [notification, ...prev]);
    });

    source.onerror = () => {
      // EventSource auto-reconnects on its own after a network blip;
      // we just reflect connection status, nothing to manually retry.
      setConnected(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [isLoggedIn, fetchExisting]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    try {
      await fetch(`/api/dashboard/notifications/${id}`, {
        method: "PUT",
        credentials: "include",
      });
    } catch {
      // Best-effort — UI already shows it as read; a failed sync here
      // just means it may show unread again after a refresh.
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await fetch("/api/dashboard/notifications/read-all", {
        method: "PUT",
        credentials: "include",
      });
    } catch {
      // Best-effort, same reasoning as markAsRead.
    }
  }, []);

  return { notifications, unreadCount, connected, markAsRead, markAllAsRead };
}
