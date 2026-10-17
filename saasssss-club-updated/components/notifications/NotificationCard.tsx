"use client";

import { Calendar, CreditCard, AlertTriangle, Info, Trash2, Loader2, Mail, MessageSquare, Globe } from "lucide-react";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  channels?: string[];
  isRead: boolean;
  sentAt: string;
  readAt?: string | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  INFO: { icon: Info, color: "text-blue-500 bg-blue-500/10" },
  SESSION: { icon: Calendar, color: "text-[var(--primary)] bg-[var(--primary)]/10" },
  PAYMENT: { icon: CreditCard, color: "text-green-500 bg-green-500/10" },
  ALERT: { icon: AlertTriangle, color: "text-red-500 bg-red-500/10" },
  SESSION_REMINDER: { icon: Calendar, color: "text-[var(--primary)] bg-[var(--primary)]/10" },
};

const CHANNEL_ICON: Record<string, React.ElementType> = {
  SITE: Globe,
  EMAIL: Mail,
  SMS: MessageSquare,
};

function timeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationCard({
  notification,
  onMarkRead,
  onDelete,
  isDeleting = false,
}: {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}) {
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.INFO;
  const Icon = config.icon;

  return (
    <div
      className={`group flex items-start gap-3 p-4 rounded-xl border transition-all ${
        notification.isRead
          ? "border-border bg-card"
          : "border-[var(--primary)]/30 bg-[var(--primary)]/5"
      } ${isDeleting ? "opacity-40" : ""}`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.color}`}>
        <Icon size={16} />
      </div>

      <button
        onClick={() => !notification.isRead && onMarkRead(notification.id)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-primary">{notification.title}</p>
          {!notification.isRead && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-muted mt-0.5">{notification.message}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-muted">{timeAgo(notification.sentAt)}</span>
          {notification.channels && notification.channels.length > 0 && (
            <span className="flex items-center gap-1.5">
              {notification.channels.map((ch) => {
                const ChIcon = CHANNEL_ICON[ch] ?? Globe;
                return <ChIcon key={ch} size={11} className="text-muted/70" />;
              })}
            </span>
          )}
        </div>
      </button>

      {onDelete && (
        <button
          onClick={() => onDelete(notification.id)}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0 disabled:opacity-60"
          aria-label="Supprimer la notification"
        >
          {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      )}
    </div>
  );
}