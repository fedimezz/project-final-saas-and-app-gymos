"use client";

import { Mail, Smartphone, MessageSquare, Loader2 } from "lucide-react";

interface Props {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  saving: string | null;
  onToggle: (key: "emailNotifications" | "pushNotifications" | "smsNotifications", value: boolean) => void;
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  saving,
  onChange,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-[var(--primary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{label}</p>
          <p className="text-xs text-muted truncate">{description}</p>
        </div>
      </div>

      <button
        onClick={() => onChange(!checked)}
        disabled={saving}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
          checked ? "bg-[var(--primary)]" : "bg-muted"
        }`}
      >
        {saving ? (
          <Loader2
            size={12}
            className="animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
          />
        ) : (
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        )}
      </button>
    </div>
  );
}

export default function NotificationPreferencesCard({
  emailNotifications,
  pushNotifications,
  smsNotifications,
  saving,
  onToggle,
}: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <h3 className="font-semibold text-primary mb-1">Notifications</h3>
      <p className="text-sm text-muted mb-2">Choisissez comment vous souhaitez être informé.</p>

      <ToggleRow
        icon={Mail}
        label="E-mail"
        description="Recevoir les notifications par e-mail"
        checked={emailNotifications}
        saving={saving === "emailNotifications"}
        onChange={(v) => onToggle("emailNotifications", v)}
      />
      <ToggleRow
        icon={Smartphone}
        label="Push"
        description="Notifications sur l'application"
        checked={pushNotifications}
        saving={saving === "pushNotifications"}
        onChange={(v) => onToggle("pushNotifications", v)}
      />
      <ToggleRow
        icon={MessageSquare}
        label="SMS"
        description="Recevoir des SMS pour les rappels importants"
        checked={smsNotifications}
        saving={saving === "smsNotifications"}
        onChange={(v) => onToggle("smsNotifications", v)}
      />
    </div>
  );
}