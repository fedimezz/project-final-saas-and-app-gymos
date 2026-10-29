"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Lock, Settings, Loader2, AlertCircle, Check, Upload, Building2, Phone, Mail, Link2, Camera, Music2, Sun, Eye, Image as ImageIcon, Type, Cpu, Database, RefreshCw, Trash2, ShieldAlert, Zap, CheckCircle2, XCircle, Clock, PartyPopper } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import ConfigurationStatus from "@/components/admin/ConfigurationStatus";

// Wired to the already-built backend (app/api/admin/settings + the
// GymSettings singleton table) — the page used to be a static placeholder
// claiming no table existed, even though the schema/model/API were there.

const DAYS = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
];

// Keys must match PageKey in context/ClubSettingsContext.tsx and the
// pageKey props used by PagePublishGate on the real pages.
const PUBLIC_PAGES = [
  { key: "coaching", label: "Coaching", href: "/coaching" },
  { key: "offres", label: "Offres", href: "/offres" },
  { key: "actualites", label: "Actualités", href: "/actualites" },
  { key: "gallery", label: "Galerie", href: "/gallery" },
] as const;

interface WorkingHours {
  [day: string]: { open: string; close: string; closed: boolean };
}

interface EnabledPages {
  [key: string]: boolean;
}

interface GymSettings {
  name: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  workingHours: WorkingHours | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundColor: string | null;
  backgroundColorDark: string | null;
  enabledPages: EnabledPages | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
}

const defaultHours: WorkingHours = Object.fromEntries(
    DAYS.map((d) => [d.key, { open: "08:00", close: "22:00", closed: d.key === "sun" }])
);

const defaultEnabledPages: EnabledPages = Object.fromEntries(
    PUBLIC_PAGES.map((p) => [p.key, true])
);

type TabKey = "identity" | "homepage" | "hours" | "pages" | "social" | "system";

const TABS: { key: TabKey; label: string; icon: typeof Building2; ownerOnly?: boolean }[] = [
  { key: "identity", label: "Identité", icon: Building2 },
  { key: "homepage", label: "Page d'accueil", icon: ImageIcon },
  { key: "hours", label: "Horaires", icon: Sun },
  { key: "pages", label: "Pages publiques", icon: Eye },
  { key: "social", label: "Réseaux sociaux", icon: Link2 },
  { key: "system", label: "Système", icon: Cpu, ownerOnly: true },
];

export default function GymSettingsPage() {
  const { userRole } = useAuth();
  const { refresh: refreshClubSettings } = useClubSettings();
  const isOwner = userRole?.toUpperCase() === "OWNER";

  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("identity");
  const [clubInfo, setClubInfo] = useState<{ slug: string; publicUrl: string; customDomain: string | null } | null>(null);
  // Shown once right after /onboarding creates the club and drops the
  // owner here directly (see app/onboarding/page.tsx). Read from the URL
  // client-side rather than useSearchParams to avoid a Suspense boundary
  // for what's a purely cosmetic, dismissable banner.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("welcome") === "1") {
      setShowWelcome(true);
    }
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── System tab state ──
  interface SystemHealth {
    db: { ok: boolean; latencyMs: number };
    counts: { userCount: number; sessionCount: number; bookingCount: number; logCount: number };
    issues: { staleBookingCounts: { id: string; coach: string; diff: number }[]; orphanedBookings: number };
    env: Record<string, boolean>;
    serverTime: string;
  }
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemAction, setSystemAction] = useState<string | null>(null);
  const [systemResult, setSystemResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchSystemHealth = useCallback(async () => {
    setSystemLoading(true);
    setSystemResult(null);
    try {
      const res = await fetch("/api/admin/system", { credentials: "include" });
      const json = await res.json();
      if (res.ok) setSystemHealth(json);
    } finally {
      setSystemLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "system" && isOwner) fetchSystemHealth();
  }, [activeTab, isOwner, fetchSystemHealth]);

  const runSystemAction = async (action: string, label: string) => {
    if (!confirm(`Exécuter : ${label} ?`)) return;
    setSystemAction(action);
    setSystemResult(null);
    try {
      const res = await fetch("/api/admin/system", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok) {
        const details = Object.entries(json)
            .filter(([k]) => k !== "ok")
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        setSystemResult({ ok: true, msg: details || "Terminé avec succès" });
        fetchSystemHealth();
      } else {
        setSystemResult({ ok: false, msg: json.error || "Erreur" });
      }
    } catch {
      setSystemResult({ ok: false, msg: "Erreur réseau" });
    } finally {
      setSystemAction(null);
    }
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const json = await res.json();
      if (res.ok) {
        setSettings({
          ...json.settings,
          workingHours: json.settings.workingHours ?? defaultHours,
          enabledPages: { ...defaultEnabledPages, ...(json.settings.enabledPages ?? {}) },
        });
        if (json.club) setClubInfo(json.club);
      } else {
        setError(json.error || "Erreur de chargement");
      }
    } catch {
      setError("Erreur serveur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const set = <K extends keyof GymSettings>(key: K, value: GymSettings[K]) =>
      setSettings((s) => (s ? { ...s, [key]: value } : s));

  const togglePage = (key: string, value: boolean) =>
      setSettings((s) =>
          s ? { ...s, enabledPages: { ...(s.enabledPages ?? defaultEnabledPages), [key]: value } } : s
      );

  const setHour = (day: string, field: "open" | "close" | "closed", value: string | boolean) =>
      setSettings((s) =>
          s
              ? {
                ...s,
                workingHours: {
                  ...(s.workingHours ?? defaultHours),
                  [day]: { ...(s.workingHours?.[day] ?? defaultHours[day]), [field]: value },
                },
              }
              : s
      );

  const handleLogoSelect = async (file: File | undefined | null) => {
    if (!file || !settings) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body });
      const json = await res.json();
      if (res.ok) {
        set("logoUrl", json.url);
      } else {
        setError(json.error || "Échec du téléversement du logo");
      }
    } catch {
      setError("Erreur réseau lors du téléversement");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    if (!settings.name.trim()) {
      setError("Le nom du club ne peut pas être vide.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (res.ok) {
        refreshClubSettings();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(json.error || "Erreur lors de l'enregistrement");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  // Admin can view every tab (matches the read-only GET permission the API
  // already grants) but can't edit — only Owner can PUT. Rather than gating
  // the whole page, everything below is wrapped in a <fieldset disabled>,
  // which greys out and disables every input/button in one place.
  return (
      <div className="space-y-6 animate-fade-in pb-24">
        <div>
          <h1 className="text-3xl font-bold text-primary">Paramètres du club</h1>
          <p className="text-muted mt-1">Tout ce qui définit votre club sur le site, organisé par section.</p>
        </div>

        {showWelcome && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] text-sm">
              <PartyPopper size={18} className="flex-shrink-0" />
              <p className="flex-1 font-medium">
                🎉 Votre club est créé ! Personnalisez-le avant d&apos;inviter vos membres.
              </p>
              <button
                  type="button"
                  onClick={() => setShowWelcome(false)}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold hover:opacity-90"
              >
                Compris
              </button>
            </div>
        )}

        {!isOwner && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 text-amber-600 text-sm">
              <Lock size={16} className="flex-shrink-0" />
              Lecture seule — seul le propriétaire peut modifier ces paramètres.
            </div>
        )}

        {!loading && settings && <ConfigurationStatus previewUrl={clubInfo?.publicUrl} />}

        {!loading && settings && (
            <div className="flex gap-1 overflow-x-auto border-b border-border pb-px">
              {TABS.filter((tab) => !tab.ownerOnly || isOwner).map((tab) => {
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                            activeTab === tab.key
                                ? "border-[var(--primary)] text-[var(--primary)]"
                                : "border-transparent text-muted hover:text-primary"
                        }`}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                );
              })}
            </div>
        )}

        {loading ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <Loader2 size={40} className="animate-spin text-[var(--primary)]" />
            </div>
        ) : !settings ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
              <AlertCircle size={28} className="text-danger" />
              <p className="text-muted">{error || "Impossible de charger les paramètres."}</p>
            </div>
        ) : (
            <>
              <fieldset disabled={!isOwner} className="space-y-6 border-0 p-0 m-0 min-w-0">
                {/* Identity */}
                {activeTab === "identity" && (
                    <div className="space-y-5">
                      {/* Subdomain / public URL widget */}
                      {clubInfo && (
                          <div className="bg-card border border-border rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                              <Link2 size={16} className="text-[var(--primary)]" />
                              <h3 className="font-semibold text-primary text-sm">URL publique du club</h3>
                            </div>
                            <div className="flex items-center gap-2 bg-muted/10 border border-border rounded-xl px-3 py-2.5">
                              <span className="text-sm font-mono text-primary truncate flex-1">{clubInfo.publicUrl}</span>
                              <button
                                  type="button"
                                  onClick={() => { navigator.clipboard.writeText(clubInfo.publicUrl); }}
                                  className="shrink-0 text-xs text-muted hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted/20"
                              >
                                Copier
                              </button>
                              <a
                                  href={clubInfo.publicUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 text-xs text-[var(--primary)] hover:underline px-2 py-1"
                              >
                                Ouvrir ↗
                              </a>
                            </div>
                            <p className="text-xs text-muted mt-2">
                              Sous-domaine : <code className="font-mono bg-muted/20 px-1 rounded">{clubInfo.slug}</code>
                              {clubInfo.customDomain && (
                                  <> · Domaine personnalisé : <code className="font-mono bg-muted/20 px-1 rounded">{clubInfo.customDomain}</code></>
                              )}
                            </p>
                          </div>
                      )}

                      <div className="bg-card border border-border rounded-2xl p-6">
                        <div className="flex items-center gap-2 mb-5">
                          <Building2 size={18} className="text-[var(--primary)]" />
                          <h2 className="font-semibold text-primary">Identité</h2>
                        </div>

                        <div className="flex items-center gap-4 mb-5">
                          <div className="w-16 h-16 rounded-xl bg-muted/30 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {settings.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                            ) : (
                                <Building2 size={22} className="text-muted" />
                            )}
                          </div>
                          <div>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingLogo}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border text-sm font-medium text-primary hover:bg-muted/30 disabled:opacity-60"
                            >
                              {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                              {uploadingLogo ? "Envoi…" : "Changer le logo"}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  handleLogoSelect(e.target.files?.[0]);
                                  e.target.value = "";
                                }}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Nom du club</label>
                            <input
                                type="text"
                                value={settings.name}
                                onChange={(e) => set("name", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Adresse</label>
                            <input
                                type="text"
                                value={settings.address ?? ""}
                                onChange={(e) => set("address", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                              <Phone size={11} /> Téléphone
                            </label>
                            <input
                                type="tel"
                                value={settings.phone ?? ""}
                                onChange={(e) => set("phone", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                              <Mail size={11} /> Email
                            </label>
                            <input
                                type="email"
                                value={settings.email ?? ""}
                                onChange={(e) => set("email", e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                )}

                {/* Homepage */}
                {activeTab === "homepage" && (
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-1">
                        <Type size={18} className="text-[var(--primary)]" />
                        <h2 className="font-semibold text-primary">Page d&apos;accueil</h2>
                      </div>
                      <p className="text-xs text-muted mb-6">
                        Texte affiché en haut de la page d&apos;accueil publique de votre club. Les couleurs, le thème et les photos se règlent dans l&apos;assistant du site.
                      </p>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Type size={11} /> Titre principal
                          </label>
                          <input
                              type="text"
                              value={settings.heroTitle ?? ""}
                              onChange={(e) => set("heroTitle", e.target.value)}
                              placeholder={settings.name}
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                          <p className="text-[11px] text-muted mt-1">Laissez vide pour utiliser le nom du club par défaut.</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide">Sous-titre</label>
                          <input
                              type="text"
                              value={settings.heroSubtitle ?? ""}
                              onChange={(e) => set("heroSubtitle", e.target.value)}
                              placeholder="L'excellence sportive dans un cadre d'exception"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                      </div>
                    </div>
                )}

                {/* Working hours */}
                {activeTab === "hours" && (
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <h2 className="font-semibold text-primary mb-4">Horaires d&apos;ouverture</h2>
                      <div className="space-y-2">
                        {DAYS.map((d) => {
                          const h = settings.workingHours?.[d.key] ?? defaultHours[d.key];
                          return (
                              <div key={d.key} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                                <span className="w-24 text-sm text-primary font-medium flex-shrink-0">{d.label}</span>
                                {h.closed ? (
                                    <span className="text-xs text-muted flex-1">Fermé</span>
                                ) : (
                                    <div className="flex items-center gap-2 flex-1">
                                      <input
                                          type="time"
                                          value={h.open}
                                          onChange={(e) => setHour(d.key, "open", e.target.value)}
                                          className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 text-sm"
                                      />
                                      <span className="text-muted text-xs">à</span>
                                      <input
                                          type="time"
                                          value={h.close}
                                          onChange={(e) => setHour(d.key, "close", e.target.value)}
                                          className="px-2.5 py-1.5 rounded-lg border border-border bg-muted/20 text-sm"
                                      />
                                    </div>
                                )}
                                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer flex-shrink-0">
                                  <input
                                      type="checkbox"
                                      checked={h.closed}
                                      onChange={(e) => setHour(d.key, "closed", e.target.checked)}
                                      className="rounded"
                                  />
                                  Fermé
                                </label>
                              </div>
                          );
                        })}
                      </div>
                    </div>
                )}

                {/* Public pages */}
                {activeTab === "pages" && (
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-1">
                        <Eye size={18} className="text-[var(--primary)]" />
                        <h2 className="font-semibold text-primary">Pages publiques</h2>
                      </div>
                      <p className="text-xs text-muted mb-4">
                        Désactiver une page la retire du menu et bloque l&apos;accès direct au lien — les visiteurs sont redirigés vers l&apos;accueil.
                      </p>
                      <div className="space-y-1">
                        {PUBLIC_PAGES.map((p) => {
                          const enabled = (settings.enabledPages ?? defaultEnabledPages)[p.key] !== false;
                          return (
                              <label
                                  key={p.key}
                                  className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl hover:bg-muted/20 cursor-pointer border-b border-border last:border-0"
                              >
                                <div>
                                  <p className="text-sm font-medium text-primary">{p.label}</p>
                                  <p className="text-xs text-muted font-mono">{p.href}</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => togglePage(p.key, e.target.checked)}
                                    className="w-5 h-5 rounded accent-[var(--primary)] cursor-pointer"
                                />
                              </label>
                          );
                        })}
                      </div>
                    </div>
                )}

                {/* Social links */}
                {activeTab === "social" && (
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <h2 className="font-semibold text-primary mb-4">Réseaux sociaux</h2>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Link2 size={11} /> Facebook
                          </label>
                          <input
                              type="url"
                              value={settings.facebookUrl ?? ""}
                              onChange={(e) => set("facebookUrl", e.target.value)}
                              placeholder="https://facebook.com/…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Camera size={11} /> Instagram
                          </label>
                          <input
                              type="url"
                              value={settings.instagramUrl ?? ""}
                              onChange={(e) => set("instagramUrl", e.target.value)}
                              placeholder="https://instagram.com/…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Music2 size={11} /> TikTok
                          </label>
                          <input
                              type="url"
                              value={settings.tiktokUrl ?? ""}
                              onChange={(e) => set("tiktokUrl", e.target.value)}
                              placeholder="https://tiktok.com/@…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Link2 size={11} /> X / Twitter
                          </label>
                          <input
                              type="url"
                              value={settings.twitterUrl ?? ""}
                              onChange={(e) => set("twitterUrl", e.target.value)}
                              placeholder="https://x.com/…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Link2 size={11} /> YouTube
                          </label>
                          <input
                              type="url"
                              value={settings.youtubeUrl ?? ""}
                              onChange={(e) => set("youtubeUrl", e.target.value)}
                              placeholder="https://youtube.com/@…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wide flex items-center gap-1">
                            <Link2 size={11} /> Site web
                          </label>
                          <input
                              type="url"
                              value={settings.websiteUrl ?? ""}
                              onChange={(e) => set("websiteUrl", e.target.value)}
                              placeholder="https://…"
                              className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                          />
                        </div>
                      </div>
                    </div>
                )}

                {/* System tab — owner only, rendered outside fieldset so it's never disabled */}
                {error && activeTab !== "system" && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-600 text-sm">
                      <AlertCircle size={16} /> {error}
                    </div>
                )}
              </fieldset>

              {/* ── System / Health tab ───────────────────────────────────────── */}
              {activeTab === "system" && isOwner && (
                  <div className="space-y-4">
                    {/* Health card */}
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                          <Database size={18} className="text-[var(--primary)]" />
                          <h2 className="font-semibold text-primary">Santé du système</h2>
                        </div>
                        <button
                            onClick={fetchSystemHealth}
                            disabled={systemLoading}
                            className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={`text-muted ${systemLoading ? "animate-spin" : ""}`} />
                        </button>
                      </div>

                      {systemLoading && !systemHealth ? (
                          <div className="flex justify-center py-8">
                            <Loader2 size={28} className="animate-spin text-[var(--primary)]" />
                          </div>
                      ) : systemHealth ? (
                          <div className="space-y-5">
                            {/* DB */}
                            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border">
                              <div className="flex items-center gap-2.5">
                                {systemHealth.db.ok
                                    ? <CheckCircle2 size={16} className="text-emerald-500" />
                                    : <XCircle size={16} className="text-red-500" />}
                                <span className="text-sm font-medium text-primary">Base de données</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted">
                                <Clock size={11} />
                                {systemHealth.db.latencyMs}ms
                                <span className={systemHealth.db.ok ? "text-emerald-500 font-medium" : "text-red-500 font-medium"}>
                            {systemHealth.db.ok ? "Connectée" : "Erreur"}
                          </span>
                              </div>
                            </div>

                            {/* Counts grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: "Utilisateurs", value: systemHealth.counts.userCount, icon: ShieldAlert },
                                { label: "Séances", value: systemHealth.counts.sessionCount, icon: Zap },
                                { label: "Réservations", value: systemHealth.counts.bookingCount, icon: Zap },
                                { label: "Logs", value: systemHealth.counts.logCount, icon: Cpu },
                              ].map(({ label, value, icon: Icon }) => (
                                  <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                                    <Icon size={14} className="text-[var(--primary)] mx-auto mb-1" />
                                    <p className="text-xl font-bold text-primary">{value.toLocaleString()}</p>
                                    <p className="text-xs text-muted">{label}</p>
                                  </div>
                              ))}
                            </div>

                            {/* Issues */}
                            {(systemHealth.issues.staleBookingCounts.length > 0 || systemHealth.issues.orphanedBookings > 0) && (
                                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <ShieldAlert size={14} /> Incohérences détectées
                                  </p>
                                  {systemHealth.issues.staleBookingCounts.length > 0 && (
                                      <p className="text-xs text-amber-700 dark:text-amber-300">
                                        {systemHealth.issues.staleBookingCounts.length} séance(s) avec un compteur de réservations incorrect.
                                        Utilisez «&nbsp;Recalculer les compteurs&nbsp;» ci-dessous.
                                      </p>
                                  )}
                                  {systemHealth.issues.orphanedBookings > 0 && (
                                      <p className="text-xs text-amber-700 dark:text-amber-300">
                                        {systemHealth.issues.orphanedBookings} réservation(s) orpheline(s) — leur séance associée n&apos;existe plus.
                                      </p>
                                  )}
                                </div>
                            )}

                            {/* Everything checks out — make the healthy state
                                visible too, not just the problem state. */}
                            {systemHealth.issues.staleBookingCounts.length === 0 && systemHealth.issues.orphanedBookings === 0 && (
                                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                  <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                                    Aucune incohérence détectée — les compteurs de réservations sont à jour.
                                  </p>
                                </div>
                            )}

                            {/* Env checks */}
                            <div>
                              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Variables d&apos;environnement</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Object.entries(systemHealth.env).map(([key, ok]) => (
                                    <div key={key} className="flex items-center gap-2 text-xs">
                                      {ok
                                          ? <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                                          : <XCircle size={13} className="text-red-500 flex-shrink-0" />}
                                      <span className={`font-mono ${ok ? "text-primary" : "text-red-500"}`}>{key}</span>
                                    </div>
                                ))}
                              </div>
                            </div>

                            <p className="text-[11px] text-muted text-right font-mono">
                              Serveur : {new Date(systemHealth.serverTime).toLocaleString("fr-FR")}
                            </p>
                          </div>
                      ) : null}
                    </div>

                    {/* Quick actions */}
                    <div className="bg-card border border-border rounded-2xl p-6">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap size={18} className="text-[var(--primary)]" />
                        <h2 className="font-semibold text-primary">Actions de maintenance</h2>
                      </div>
                      <p className="text-xs text-muted mb-5">Ces opérations sont irréversibles. Utilisez-les uniquement si vous savez ce que vous faites.</p>

                      {systemResult && (
                          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm mb-4 ${systemResult.ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600"}`}>
                            {systemResult.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                            {systemResult.msg}
                          </div>
                      )}

                      <div className="grid sm:grid-cols-2 gap-3">
                        {[
                          {
                            action: "recount_bookings",
                            label: "Recalculer les compteurs",
                            desc: "Resynchronise currentBookings de chaque séance avec le nombre réel de réservations actives.",
                            color: "text-blue-600 dark:text-blue-400",
                            bg: "bg-blue-500/10 hover:bg-blue-500/20",
                            icon: RefreshCw,
                          },
                          {
                            action: "expire_subscriptions",
                            label: "Expirer les abonnements",
                            desc: "Passe en EXPIRED tous les abonnements dont la date de fin est dépassée mais dont le statut est encore ACTIVE.",
                            color: "text-amber-600 dark:text-amber-400",
                            bg: "bg-amber-500/10 hover:bg-amber-500/20",
                            icon: Clock,
                          },
                          {
                            action: "clear_old_notifications",
                            label: "Purger notifications lues",
                            desc: "Supprime les notifications lues de plus de 30 jours pour alléger la base de données.",
                            color: "text-purple-600 dark:text-purple-400",
                            bg: "bg-purple-500/10 hover:bg-purple-500/20",
                            icon: Trash2,
                          },
                          {
                            action: "ping_db",
                            label: "Tester la base de données",
                            desc: "Envoie un ping simple à PostgreSQL et affiche la latence aller-retour.",
                            color: "text-emerald-600 dark:text-emerald-400",
                            bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
                            icon: Database,
                          },
                        ].map(({ action, label, desc, color, bg, icon: Icon }) => (
                            <button
                                key={action}
                                onClick={() => runSystemAction(action, label)}
                                disabled={!!systemAction}
                                className={`flex items-start gap-3 p-4 rounded-xl border border-border ${bg} text-left transition-colors disabled:opacity-50`}
                            >
                              <div className={`flex-shrink-0 mt-0.5 ${color}`}>
                                {systemAction === action
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <Icon size={16} />}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${color}`}>{label}</p>
                                <p className="text-xs text-muted mt-0.5 leading-relaxed">{desc}</p>
                              </div>
                            </button>
                        ))}
                      </div>
                    </div>
                  </div>
              )}
            </>
        )}

        {/* Sticky save bar — Owner only; Admin is view-only so there's nothing to save */}
        {isOwner && settings && !loading && activeTab !== "system" && (
            <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card/95 backdrop-blur border-t border-border p-4 flex items-center justify-end gap-3 z-20">
              {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <Check size={16} /> Enregistré
            </span>
              )}
              <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                Enregistrer les modifications
              </button>
            </div>
        )}
      </div>
  );
}