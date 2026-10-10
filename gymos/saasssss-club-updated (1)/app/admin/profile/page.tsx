"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, ShieldCheck, UserCircle, Sliders } from "lucide-react";

import ProfileInfoCard from "@/components/profile/ProfileInfoCard";
import ProfilePasswordCard from "@/components/profile/ProfilePasswordCard";
import GeneralPreferencesCard from "@/components/settings/GeneralPreferencesCard";
import NotificationPreferencesCard from "@/components/settings/NotificationPreferencesCard";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";

// Owner/Admin previously had nowhere to set their own language, dark mode,
// or notification channels — /dashboard/settings exists for MEMBER but
// isn't reachable from inside the /admin shell, and the backend
// (/api/dashboard/settings) is already role-agnostic (requireUser), so
// this just surfaces it here via a second tab instead of duplicating a
// whole new route.

type Language = "FR" | "EN" | "AR";

interface Preferences {
  language: Language;
  darkMode: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
}

// ─── Types ─────────────────────────────────────────────────────────────────
// Same shape as the member-side profile response (GET /api/dashboard/profile
// is role-agnostic — it reads off the token's userId, not the role), trimmed
// down to only the fields this page actually renders.

interface AdminProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "MEMBER" | "ADMIN" | "OWNER";
  createdAt: string;
}

// ─── Toast ──────────────────────────────────────────────────────────────────

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

// ─── Trimmed identity card ──────────────────────────────────────────────────
// Deliberately doesn't reuse the member-side ProfileAvatar component: that
// one is built around attendance/booking stat counters, which are always
// going to read 0 for staff accounts (admins/owners don't book sessions or
// check in as members) and would just look like a broken/empty widget here.

function AdminIdentityCard({ profile }: { profile: AdminProfile }) {
  const initials = profile.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const joined = new Date(profile.createdAt).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center text-center gap-4">
      <div className="w-20 h-20 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
        <span className="text-2xl font-bold text-[var(--primary)]">{initials}</span>
      </div>
      <div>
        <p className="font-bold text-primary text-lg">{profile.name}</p>
        <p className="text-sm text-muted">{profile.email}</p>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--primary)]/10">
        <ShieldCheck size={14} className="text-[var(--primary)]" />
        <span className="text-xs font-bold text-[var(--primary)]">{profile.role}</span>
      </div>
      <p className="text-xs text-muted">Membre de l&apos;équipe depuis le {joined}</p>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminProfilePage() {
  const { setLang } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [tab, setTab] = useState<"account" | "preferences">("account");

  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingNotif, setSavingNotif] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  const fetchProfile = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await fetch("/api/dashboard/profile", {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          setProfile(data.user);
        } else {
          showToast(data.error || "Erreur de chargement", "error");
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
    fetchProfile(true);
  }, [fetchProfile]);

  const fetchPrefs = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const res = await fetch("/api/dashboard/settings", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setPrefs(data.preferences);
      else showToast(data.error || "Erreur de chargement des préférences", "error");
    } catch {
      showToast("Erreur serveur", "error");
    } finally {
      setPrefsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const updatePrefs = async (patch: Partial<Preferences>) => {
    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) {
        setPrefs((p) => (p ? { ...p, ...patch } : p));
      } else {
        showToast(data.error || "Erreur lors de l'enregistrement", "error");
      }
      return res.ok;
    } catch {
      showToast("Erreur réseau", "error");
      return false;
    }
  };

  const handleLanguageChange = async (language: Language) => {
    setSavingLanguage(true);
    await setLang(language, { persist: false });
    await updatePrefs({ language });
    setSavingLanguage(false);
  };

  const handleThemeToggle = async () => {
    if (!prefs) return;
    const nextDark = !isDark;
    // Apply immediately through the real ThemeContext instead of only
    // writing the DB flag — same bug/fix as the member settings page.
    toggleTheme();
    setSavingTheme(true);
    const ok = await updatePrefs({ darkMode: nextDark });
    if (!ok) toggleTheme();
    setSavingTheme(false);
  };

  const handleNotifToggle = async (
    key: "emailNotifications" | "pushNotifications" | "smsNotifications",
    value: boolean
  ) => {
    setSavingNotif(key);
    await updatePrefs({ [key]: value });
    setSavingNotif(null);
  };

  const handleSaveInfo = async (name: string, phone: string) => {
    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, ...data.user } : prev));
        showToast("Profil mis à jour avec succès", "success");
        return true;
      } else {
        showToast(data.error || "Erreur de mise à jour", "error");
        return false;
      }
    } catch {
      showToast("Erreur serveur", "error");
      return false;
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const res = await fetch("/api/dashboard/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Mot de passe mis à jour avec succès", "success");
        return true;
      } else {
        showToast(data.error || "Erreur", "error");
        return false;
      }
    } catch {
      showToast("Erreur serveur", "error");
      return false;
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={44} className="animate-spin text-[var(--primary)]" />
          <p className="text-sm text-muted">Chargement de votre profil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
        <p className="text-muted text-center">Profil introuvable.</p>
        <button
          onClick={() => fetchProfile(true)}
          className="px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl hover:bg-[var(--primary-dark)] transition-colors text-sm font-medium"
        >
          Réessayer
        </button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary">Mon Profil</h1>
          <p className="mt-1 text-muted">
            Gérez vos informations personnelles et votre sécurité.
          </p>
        </div>
        <button
          onClick={() => fetchProfile(false)}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-muted hover:bg-muted/70 rounded-xl transition-colors disabled:opacity-50 font-medium"
        >
          {isRefreshing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {isRefreshing ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-border pb-px">
        <button
          onClick={() => setTab("account")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "account"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          <UserCircle size={15} /> Compte
        </button>
        <button
          onClick={() => setTab("preferences")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "preferences"
              ? "border-[var(--primary)] text-[var(--primary)]"
              : "border-transparent text-muted hover:text-primary"
          }`}
        >
          <Sliders size={15} /> Préférences
        </button>
      </div>

      {tab === "account" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <AdminIdentityCard profile={profile} />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <ProfileInfoCard
              name={profile.name}
              email={profile.email}
              phone={profile.phone}
              role={profile.role}
              onSave={handleSaveInfo}
            />
            <ProfilePasswordCard onSave={handleChangePassword} />
          </div>
        </div>
      ) : prefsLoading || !prefs ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <GeneralPreferencesCard
            language={prefs.language}
            darkMode={isDark}
            savingLanguage={savingLanguage}
            savingTheme={savingTheme}
            onLanguageChange={handleLanguageChange}
            onThemeToggle={handleThemeToggle}
          />
          <NotificationPreferencesCard
            emailNotifications={prefs.emailNotifications}
            pushNotifications={prefs.pushNotifications}
            smsNotifications={prefs.smsNotifications}
            saving={savingNotif}
            onToggle={handleNotifToggle}
          />
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
