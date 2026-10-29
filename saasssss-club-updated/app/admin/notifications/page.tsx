"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2, Send, Users, UserCheck, User, Bell, Search,
  X, Globe, Mail, MessageSquare, Trash2, Check,
} from "lucide-react";

interface SentNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  channels?: string[];
  isRead: boolean;
  sentAt: string;
  user: { name: string; email: string };
}

interface MemberResult {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  isActive: boolean;
}

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium animate-fade-in ${type === "success" ? "bg-card border-green-500/30 text-green-600" : "bg-card border-red-500/30 text-red-600"}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}

type Target = "ALL" | "ACTIVE" | "USER";

const CHANNEL_OPTIONS: { value: string; label: string; icon: React.ElementType; ready: boolean }[] = [
  { value: "SITE", label: "Sur le site", icon: Globe, ready: true },
  { value: "EMAIL", label: "Email", icon: Mail, ready: false },
  { value: "SMS", label: "SMS", icon: MessageSquare, ready: false },
];

// ─── Member search picker ────────────────────────────────────────────────

function MemberPicker({
  selected,
  onChange,
}: {
  selected: MemberResult[];
  onChange: (members: MemberResult[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });
      const json = await res.json();
      setResults(res.ok && Array.isArray(json.members) ? json.members : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250); // debounce
    return () => clearTimeout(t);
  }, [query, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleMember = (member: MemberResult) => {
    const isSelected = selected.some((m) => m.id === member.id);
    if (isSelected) {
      onChange(selected.filter((m) => m.id !== member.id));
    } else {
      onChange([...selected, member]);
    }
  };

  const removeMember = (id: string) => onChange(selected.filter((m) => m.id !== id));

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((m) => (
            <span
              key={m.id}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-xs font-medium text-[var(--primary)]"
            >
              <span className="w-5 h-5 rounded-full bg-[var(--primary)]/20 flex items-center justify-center text-[10px] font-bold">
                {m.name.charAt(0).toUpperCase()}
              </span>
              {m.name}
              <button onClick={() => removeMember(m.id)} className="hover:opacity-70">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un membre par nom, email ou téléphone..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition text-sm"
        />
      </div>

      {/* Dropdown results */}
      {open && (
        <div className="absolute z-20 mt-2 w-full bg-card border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
            </div>
          ) : !results?.length ? (
            <p className="text-sm text-muted text-center py-6">Aucun membre trouvé.</p>
          ) : (
            results.map((m) => {
              const isSelected = selected.some((s) => s.id === m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors text-left"
                >
                  <span className="w-8 h-8 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{m.name}</p>
                    <p className="text-xs text-muted truncate">{m.email}</p>
                  </span>
                  {!m.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted flex-shrink-0">Inactif</span>
                  )}
                  {isSelected && <Check size={16} className="text-[var(--primary)] flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const [form, setForm] = useState({
    title: "",
    message: "",
    type: "INFO",
    target: "ALL" as Target,
    channels: ["SITE"] as string[],
  });
  const [selectedMembers, setSelectedMembers] = useState<MemberResult[]>([]);
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<SentNotification[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (m: string, t: "success" | "error") => setToast({ message: m, type: t });

  const fetchRecent = useCallback(async () => {
    const res = await fetch("/api/admin/notifications", {
      credentials: "include",
    });
    const json = await res.json();
    if (res.ok) setRecent(json.notifications);
    setLoadingRecent(false);
  }, []);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const toggleChannel = (value: string, ready: boolean) => {
    if (!ready) return; // EMAIL/SMS not wired up yet — selection disabled for now
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(value)
        ? f.channels.filter((c) => c !== value)
        : [...f.channels, value],
    }));
  };

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      showToast("Titre et message requis", "error"); return;
    }
    if (form.target === "USER" && selectedMembers.length === 0) {
      showToast("Veuillez sélectionner au moins un membre", "error"); return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          type: form.type,
          target: form.target === "USER" ? selectedMembers.map((m) => m.id) : form.target,
          channels: form.channels,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(json.message, "success");
        setForm({ title: "", message: "", type: "INFO", target: "ALL", channels: ["SITE"] });
        setSelectedMembers([]);
        fetchRecent();
      } else {
        showToast(json.error, "error");
      }
    } finally {
      setSending(false);
    }
  };

  const handleDeleteRecent = async (id: string) => {
    const previous = recent;
    setDeletingId(id);
    setRecent((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch(`/api/admin/notifications?id=${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) setRecent(previous);
    } catch {
      setRecent(previous);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (recent.length === 0) return;
    if (!window.confirm("Supprimer toutes les notifications récentes ? Cette action est irréversible.")) return;
    const previous = recent;
    setClearingAll(true);
    setRecent([]);
    try {
      const res = await fetch("/api/admin/notifications/clear-all", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setRecent(previous);
        showToast("Échec de la suppression", "error");
      } else {
        showToast("Toutes les notifications ont été supprimées", "success");
      }
    } catch {
      setRecent(previous);
      showToast("Erreur serveur", "error");
    } finally {
      setClearingAll(false);
    }
  };

  const TARGET_OPTIONS: { value: Target; label: string; desc: string; icon: React.ElementType }[] = [
    { value: "ALL", label: "Tous les membres", desc: "Envoie à l'ensemble des membres inscrits", icon: Users },
    { value: "ACTIVE", label: "Membres actifs", desc: "Membres avec abonnement actif uniquement", icon: UserCheck },
    { value: "USER", label: "Membre(s) spécifique(s)", desc: "Rechercher et sélectionner un ou plusieurs membres", icon: User },
  ];

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-primary">Notifications</h1>
        <p className="text-muted mt-1">Envoyer des notifications aux membres du club.</p>
      </div>

      {/* Compose */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <h2 className="font-semibold text-primary flex items-center gap-2">
          <Send size={18} className="text-[var(--primary)]" />
          Composer une notification
        </h2>

        {/* Target */}
        <div>
          <p className="text-sm font-medium text-primary mb-3">Destinataires</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {TARGET_OPTIONS.map(({ value, label, desc, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setForm((f) => ({ ...f, target: value }))}
                className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                  form.target === value
                    ? "border-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-border hover:bg-muted"
                }`}
              >
                <Icon size={20} className={form.target === value ? "text-[var(--primary)]" : "text-muted"} />
                <p className="text-sm font-semibold text-primary">{label}</p>
                <p className="text-xs text-muted">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Member picker */}
        {form.target === "USER" && (
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Membres <span className="text-danger">*</span></label>
            <MemberPicker selected={selectedMembers} onChange={setSelectedMembers} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Titre <span className="text-danger">*</span></label>
            <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition text-sm"
              placeholder="Titre de la notification" />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary mb-1.5">Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 text-sm">
              <option value="INFO">Information</option>
              <option value="SESSION">Session</option>
              <option value="PAYMENT">Paiement</option>
              <option value="ALERT">Alerte</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-primary mb-1.5">Message <span className="text-danger">*</span></label>
          <textarea value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-muted border border-border text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition text-sm resize-none"
            placeholder="Contenu de la notification..." />
        </div>

        {/* Channels */}
        <div>
          <p className="text-sm font-medium text-primary mb-3">Canaux d&apos;envoi</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHANNEL_OPTIONS.map(({ value, label, icon: Icon, ready }) => {
              const isChecked = form.channels.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleChannel(value, ready)}
                  disabled={!ready}
                  className={`relative flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                    isChecked
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-border hover:bg-muted"
                  } ${!ready ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                    isChecked ? "bg-[var(--primary)] border-[var(--primary)]" : "border-border"
                  }`}>
                    {isChecked && <Check size={12} className="text-white" />}
                  </span>
                  <Icon size={16} className={isChecked ? "text-[var(--primary)]" : "text-muted"} />
                  <span className="text-sm font-medium text-primary">{label}</span>
                  {!ready && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted font-medium">
                      Bientôt
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-2">
            Email et SMS seront activés une fois le service d&apos;envoi connecté — la notification sur le site reste toujours disponible.
          </p>
        </div>

        <button onClick={handleSend} disabled={sending}
          className="flex items-center gap-2 px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors font-medium text-sm disabled:opacity-60">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {sending ? "Envoi en cours..." : "Envoyer la notification"}
        </button>
      </div>

      {/* Recent notifications */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-primary flex items-center gap-2">
            <Bell size={18} className="text-[var(--primary)]" />
            Notifications récentes
          </h2>
          {recent.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-60"
            >
              {clearingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Tout supprimer
            </button>
          )}
        </div>
        {loadingRecent ? (
          <div className="flex justify-center py-8"><Loader2 size={28} className="animate-spin text-[var(--primary)]" /></div>
        ) : recent.length === 0 ? (
          <p className="text-muted text-center py-8">Aucune notification envoyée.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {recent.map((n) => (
              <div key={n.id} className="group flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                  <Bell size={14} className="text-[var(--primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">{n.title}</p>
                  <p className="text-xs text-muted truncate">{n.message}</p>
                  <p className="text-xs text-muted mt-1">
                    → {n.user.name} • {new Date(n.sentAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${n.isRead ? "bg-muted text-muted" : "bg-[var(--primary)]/10 text-[var(--primary)] font-medium"}`}>
                  {n.isRead ? "Lu" : "Non lu"}
                </span>
                <button
                  onClick={() => handleDeleteRecent(n.id)}
                  disabled={deletingId === n.id}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10 transition-all flex-shrink-0 disabled:opacity-60"
                  aria-label="Supprimer"
                >
                  {deletingId === n.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}