"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader2, RefreshCw } from "lucide-react";

import ProfileAvatar from "@/components/profile/ProfileAvatar";
import ProfileMembershipCard from "@/components/profile/ProfileMembershipCard";
import ProfileInfoCard from "@/components/profile/ProfileInfoCard";
import ProfileSubscriptionCard from "@/components/profile/ProfileSubscriptionCard";
import ProfilePasswordCard from "@/components/profile/ProfilePasswordCard";

// ─── Types ─────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: "MEMBER" | "ADMIN" | "OWNER";
  isActive: boolean;
  createdAt: string;
  subscriptions: {
    id: string;
    endDate: string;
    status: string;
    plan: { name: string; price: number; currency: string };
  }[];
  membershipCard: {
    cardNumber: string;
    isActive: boolean;
    expiresAt: string | null;
  } | null;
  _count: {
    attendances: number;
    userSessions: number;
  };
}

// ─── Toast Component ──────────────────────────────────────────────────────

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

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { updateUser } = useAuth();
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);



  const fetchProfile = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);

    try {
      // NOTE: matches the route file at app/api/dashboard/profile/route.ts
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
  }, [showToast]);

  useEffect(() => {
    fetchProfile(true);
  }, [fetchProfile]);

  const handleSaveInfo = async (name: string, phone: string) => {
    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, ...data.user } : prev));
        updateUser(data.user ?? {});
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
        headers: {
          "Content-Type": "application/json",
        },
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
            <Loader2 size={44} className="animate-spin text-primary" />
            <p className="text-sm text-muted">Chargement de votre profil...</p>
          </div>
        </div>
    );
  }

  if (!profile) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <span className="text-4xl">👤</span>
          </div>
          <p className="text-muted text-center">Profil introuvable.</p>
          <button
              onClick={() => fetchProfile(true)}
              className="px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            Réessayer
          </button>
        </div>
    );
  }

  const activeSubscription = profile.subscriptions?.[0] ?? null;

  const handleAvatarChange = async (avatarDataUrl: string) => {
    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatar: avatarDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Impossible de mettre à jour la photo", "error");
        return false;
      }
      setProfile((prev) => (prev ? { ...prev, avatar: data.user?.avatar ?? null } : prev));
      updateUser({ avatar: data.user?.avatar ?? null });
      showToast("Photo de profil mise à jour", "success");
      return true;
    } catch {
      showToast("Erreur serveur", "error");
      return false;
    }
  };

  // ── Render ──
  return (
      <div className="space-y-8 animate-fade-in">
        {/* Page header */}
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

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6">
            <ProfileAvatar
                name={profile.name}
                email={profile.email}
                avatar={profile.avatar}
                role={profile.role}
                createdAt={profile.createdAt}
                attendanceCount={profile._count.attendances}
                bookingCount={profile._count.userSessions}
                onAvatarChange={handleAvatarChange}
            />
            <ProfileMembershipCard card={profile.membershipCard} />
          </div>

          {/* Right columns */}
          <div className="lg:col-span-2 space-y-6">
            <ProfileInfoCard
                name={profile.name}
                email={profile.email}
                phone={profile.phone}
                role={profile.role}
                onSave={handleSaveInfo}
            />
            <ProfileSubscriptionCard subscription={activeSubscription} />
            <ProfilePasswordCard onSave={handleChangePassword} />
          </div>
        </div>

        {/* Toast */}
        {toast && (
            <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>
  );
}