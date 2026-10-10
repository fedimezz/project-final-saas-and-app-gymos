// src/components/layout/NotificationBell.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useTheme } from "@/context/ThemeContext";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export default function NotificationBell() {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useRealtimeNotifications();

  // Same click-outside-to-close pattern your Navbar already uses for the
  // dashboard-menu-dropdown, just scoped to this component's own ref
  // instead of a CSS class lookup.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded-lg transition ${
          isDark ? "text-gray-200 hover:bg-neutral-900" : "text-gray-600 hover:bg-gray-100"
        }`}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg shadow-lg border z-50 ${
            isDark ? "bg-neutral-800 border-neutral-700" : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${
              isDark ? "border-neutral-700" : "border-gray-100"
            }`}
          >
            <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs font-medium text-green-600 hover:text-green-700"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className={`px-4 py-8 text-center text-sm ${isDark ? "text-neutral-400" : "text-gray-500"}`}>
              Aucune notification.
            </p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.isRead && markAsRead(n.id)}
                  className={`px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors ${
                    isDark ? "border-neutral-700" : "border-gray-100"
                  } ${
                    n.isRead
                      ? isDark ? "bg-transparent" : "bg-transparent"
                      : isDark ? "bg-neutral-900/60" : "bg-green-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-green-600 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                        {n.title}
                      </p>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-400" : "text-gray-600"}`}>
                        {n.message}
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? "text-neutral-500" : "text-gray-400"}`}>
                        {timeAgo(n.sentAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
