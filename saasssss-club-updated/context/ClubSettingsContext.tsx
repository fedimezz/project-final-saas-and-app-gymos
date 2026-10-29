"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { brandVars } from "@/lib/brand-colors";
import { resolveThemeId, resolveHeroModel, DEFAULT_THEME_ID, getTheme, type ThemeId, type HeroModelId } from "@/lib/website-themes";
import { sanitizeTransform, type HeroModelTransform } from "@/lib/hero-model";

/** An owner-uploaded 3D model, as the public site loads it (same-origin URL). */
export interface CustomHeroModel {
  url: string;
  format: "glb" | "gltf";
  byteSize: number;
  transform: HeroModelTransform;
}

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
  // How the 3D slot renders: a built-in object, the owner's upload, or nothing.
  heroMode: "builtin" | "custom" | "none";
  heroCustomModel: CustomHeroModel | null;
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
  name: "ClubX",
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
  heroMode: "builtin",
  heroCustomModel: null,
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

// Only same-origin /api/hero-model URLs are ever handed to the 3D loader.
function parseHero(json: Record<string, unknown>): Pick<ClubSettings, "heroMode" | "heroCustomModel"> {
  const custom = json.heroCustomModel as Partial<CustomHeroModel> | null | undefined;
  if (json.heroMode === "none") return { heroMode: "none", heroCustomModel: null };
  if (
    json.heroMode === "custom" &&
    custom &&
    typeof custom.url === "string" &&
    custom.url.startsWith("/api/hero-model") &&
    (custom.format === "glb" || custom.format === "gltf")
  ) {
    return {
      heroMode: "custom",
      heroCustomModel: {
        url: custom.url,
        format: custom.format,
        byteSize: Number(custom.byteSize) || 0,
        transform: sanitizeTransform(custom.transform),
      },
    };
  }
  return { heroMode: "builtin", heroCustomModel: null };
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

/** Public settings JSON (from /api/settings/public or the server layout) -> typed settings. */
export function parseClubSettings(json: Record<string, unknown>): ClubSettings {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    name: str(json.name) || DEFAULTS.name,
    logoUrl: (json.logoUrl as string | null | undefined) ?? null,
    primaryColor: str(json.primaryColor) || DEFAULTS.primaryColor,
    backgroundColor: str(json.backgroundColor) || DEFAULTS.backgroundColor,
    backgroundColorDark: str(json.backgroundColorDark) || DEFAULTS.backgroundColorDark,
    enabledPages: normalizeEnabledPages(json.enabledPages),
    heroTitle: str(json.heroTitle),
    heroSubtitle: str(json.heroSubtitle),
    heroImageUrl: str(json.heroImageUrl),
    description: str(json.description),
    secondaryColor: str(json.secondaryColor),
    facebookUrl: str(json.facebookUrl),
    instagramUrl: str(json.instagramUrl),
    tiktokUrl: str(json.tiktokUrl),
    twitterUrl: str(json.twitterUrl),
    youtubeUrl: str(json.youtubeUrl),
    websiteUrl: str(json.websiteUrl),
    phone: str(json.phone),
    email: str(json.email),
    address: str(json.address),
    themeId: resolveThemeId(json.themeId as string | null | undefined),
    heroModel: resolveHeroModel(json.themeId as string | null | undefined, json.heroModel as string | null | undefined),
    ...parseHero(json),
    hasTenant: json.hasTenant !== false,
  };
}

// A visibility-triggered refresh is skipped when the settings were fetched/provided less than this ago.
const VISIBILITY_REFRESH_MIN_MS = 30_000;

export function ClubSettingsProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  /**
   * Settings resolved on the server for this request (app/layout.tsx). When present the
   * first render already has the club's real identity: no blank page while a client fetch
   * is in flight, and no duplicate /api/settings/public call on load.
   */
  initial?: Record<string, unknown> | null;
}) {
  const { isDark } = useTheme();
  const [settings, setSettings] = useState<ClubSettings>(() => (initial ? parseClubSettings(initial) : DEFAULTS));
  const [loading, setLoading] = useState(!initial);
  const lastLoadedAt = useRef(0); // ms timestamp of the last time settings were fetched/provided

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/public", { cache: "no-store" });
      if (res.ok) {
        const next = parseClubSettings(await res.json());
        lastLoadedAt.current = Date.now();
        setSettings(next);
        // Only override the theme's brand color for a real tenant — the SaaS
        // marketing site keeps the platform's own default token colors.
        if (next.hasTenant) applyBrandColor(next.primaryColor, next.secondaryColor);
      }
    } catch {
      // Keep current settings on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) {
      // Server already provided the settings: just make the client-side brand vars match.
      lastLoadedAt.current = Date.now();
      if (settings.hasTenant) applyBrandColor(settings.primaryColor, settings.secondaryColor);
      return;
    }
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: `initial` never changes for a mounted provider
  }, []);

  // The owner can change the theme in another tab/admin screen: pick it up
  // when this tab becomes visible again instead of waiting for a hard reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAt.current < VISIBILITY_REFRESH_MIN_MS) return;
      fetchSettings();
    };
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

  // Memoized: every consumer (navbar, footer, hero, sections) re-rendered on each
  // provider render because this object was recreated every time.
  const value = useMemo(
    () => ({ ...settings, loading, refresh: fetchSettings, isPageEnabled }),
    [settings, loading, fetchSettings, isPageEnabled]
  );

  return (
    <ClubSettingsContext.Provider value={value}>
      {children}
    </ClubSettingsContext.Provider>
  );
}

export function useClubSettings() {
  return useContext(ClubSettingsContext);
}
