"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { brandVars } from "@/lib/brand-colors";
import { resolveThemeId, resolveHeroModel, DEFAULT_THEME_ID, getTheme, type ThemeId, type HeroModelId } from "@/lib/website-themes";

export type PageKey = "coaching" | "offres" | "actualites" | "gallery";

type EnabledPages = Record<PageKey, boolean>;

interface ClubSettings {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  backgroundColorDark: string;
  enabledPages: EnabledPages;
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  description: string | null;
  secondaryColor: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
  // Public business contact info (not owner/staff PII) — same as what the
  // public site shows in its footer/contact section.
  phone: string | null;
  email: string | null;
  address: string | null;
  // Website theme + 3D hero object chosen by the owner (always valid ids).
  themeId: ThemeId;
  heroModel: HeroModelId;
  // false only when the request resolved to no subdomain/tenant at all
  // (apex/platform host) — i.e. this is the SaaS marketing site itself,
  // not any one gym's page. Defaults to true so real tenant sites never
  // flash the wrong UI while this is loading.
  hasTenant: boolean;
}

interface ClubSettingsContextType extends ClubSettings {
  loading: boolean;
  refresh: () => void;
  isPageEnabled: (key: PageKey) => boolean;
}

const DEFAULT_ENABLED_PAGES: EnabledPages = {
  coaching: true,
  offres: true,
  actualites: true,
  gallery: true,
};

const DEFAULTS: ClubSettings = {
  name: "Le Club de Gammarth",
  logoUrl: null,
  primaryColor: "#10b981",
  backgroundColor: "#ffffff",
  backgroundColorDark: "#090d16",
  enabledPages: DEFAULT_ENABLED_PAGES,
  heroTitle: null,
  heroSubtitle: null,
  heroImageUrl: null,
  description: null,
  secondaryColor: null,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  twitterUrl: null,
  youtubeUrl: null,
  websiteUrl: null,
  phone: null,
  email: null,
  address: null,
  themeId: DEFAULT_THEME_ID,
  heroModel: getTheme(DEFAULT_THEME_ID).defaultHeroModel,
  hasTenant: true,
};

const ClubSettingsContext = createContext<ClubSettingsContextType>({
  ...DEFAULTS,
  loading: true,
  refresh: () => {},
  isPageEnabled: () => true,
});

function applyBrandColor(hex: string, secondaryHex: string | null) {
  const root = document.documentElement;
  // brandVars() = --primary*, --secondary*, --brand, --brand-2, --brand-contrast.
  // globals.css maps Tailwind's emerald/green/teal palettes onto --brand/--brand-2,
  // so the whole UI (navbar, footer, admin sidebar, buttons...) follows the theme.
  for (const [name, value] of Object.entries(brandVars(hex, secondaryHex))) {
    root.style.setProperty(name, value, "important");
  }
}

function applyBackgroundColor(hex: string) {
  if (!hex) return;
  document.documentElement.style.setProperty("--bg-primary", hex, "important");
}

function normalizeEnabledPages(raw: unknown): EnabledPages {
  if (!raw || typeof raw !== "object") return DEFAULT_ENABLED_PAGES;
  const src = raw as Partial<Record<PageKey, boolean>>;
  return {
    coaching: src.coaching !== false,
    offres: src.offres !== false,
    actualites: src.actualites !== false,
    gallery: src.gallery !== false,
  };
}

export function ClubSettingsProvider({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  const [settings, setSettings] = useState<ClubSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/public", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const next: ClubSettings = {
          name: json.name || DEFAULTS.name,
          logoUrl: json.logoUrl ?? null,
          primaryColor: json.primaryColor || DEFAULTS.primaryColor,
          backgroundColor: json.backgroundColor || DEFAULTS.backgroundColor,
          backgroundColorDark: json.backgroundColorDark || DEFAULTS.backgroundColorDark,
          enabledPages: normalizeEnabledPages(json.enabledPages),
          heroTitle: json.heroTitle || null,
          heroSubtitle: json.heroSubtitle || null,
          heroImageUrl: json.heroImageUrl || null,
          description: json.description || null,
          secondaryColor: json.secondaryColor || null,
          facebookUrl: json.facebookUrl || null,
          instagramUrl: json.instagramUrl || null,
          tiktokUrl: json.tiktokUrl || null,
          twitterUrl: json.twitterUrl || null,
          youtubeUrl: json.youtubeUrl || null,
          websiteUrl: json.websiteUrl || null,
          phone: json.phone || null,
          email: json.email || null,
          address: json.address || null,
          themeId: resolveThemeId(json.themeId),
          heroModel: resolveHeroModel(json.themeId, json.heroModel),
          hasTenant: json.hasTenant !== false,
        };
        setSettings(next);
        // Only override the theme's brand color for a real tenant — the SaaS
        // marketing site keeps the platform's own default token colors.
        if (next.hasTenant) applyBrandColor(next.primaryColor, next.secondaryColor);
      }
    } catch {
      // Keep defaults on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // The owner can change the theme in another tab/admin screen: pick it up
  // when this tab becomes visible again instead of waiting for a hard reload.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") fetchSettings(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("club-settings-updated", fetchSettings);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("club-settings-updated", fetchSettings);
    };
  }, [fetchSettings]);

  useEffect(() => {
    applyBackgroundColor(isDark ? settings.backgroundColorDark : settings.backgroundColor);
  }, [isDark, settings.backgroundColor, settings.backgroundColorDark]);

  const isPageEnabled = useCallback(
    (key: PageKey) => settings.enabledPages[key] !== false,
    [settings.enabledPages]
  );

  return (
    <ClubSettingsContext.Provider value={{ ...settings, loading, refresh: fetchSettings, isPageEnabled }}>
      {children}
    </ClubSettingsContext.Provider>
  );
}

export function useClubSettings() {
  return useContext(ClubSettingsContext);
}
