"use client";

import { useState, useEffect } from "react";
import { BellOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  sentAt: string;
}

export default function NotificationList() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    fetch("/api/dashboard/notifications?limit=5", {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <h2 className="text-xl font-bold text-primary mb-4">Notifications</h2>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center text-center py-6 gap-2">
          <BellOff size={22} className="text-muted" />
          <p className="text-sm text-muted">Aucune notification pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`border-b border-border pb-3 last:border-0 ${
                item.isRead ? "text-muted" : "text-secondary font-medium"
              }`}
            >
              {item.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}