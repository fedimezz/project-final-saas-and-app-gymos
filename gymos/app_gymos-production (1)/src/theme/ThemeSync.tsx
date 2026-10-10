import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { fetchPublicSettings } from "@/api/settings";
import { storage } from "@/lib/storage";
import type { ClubBranding } from "@/theme/palette";

// Renders nothing — keeps the app's colors in sync with what the club owner
// chose on the website (theme preset or custom colors):
//  1. instant paint from the last branding cached for this club (no flash of
//     the neutral palette on launch),
//  2. refetch from /api/settings/public (public, cached server-side),
//  3. refetch whenever the app returns to the foreground, so a theme change by
//     the owner shows up without reinstalling or restarting the app.
// Kept separate from the auth/theme providers so neither needs to know the other.
const REFRESH_MIN_INTERVAL_MS = 60_000;
const cacheKey = (slug: string) => `gymos.branding.${slug.replace(/[^A-Za-z0-9._-]/g, "_")}`;

function toBranding(s: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
}): ClubBranding {
  return {
    primaryColor: s.primaryColor,
    secondaryColor: s.secondaryColor,
    backgroundColor: s.backgroundColor,
    backgroundColorDark: s.backgroundColorDark,
  };
}

export default function ThemeSync() {
  const { club } = useAuth();
  const { setClubBranding } = useTheme();

  useEffect(() => {
    if (!club) {
      setClubBranding(null);
      return;
    }
    const slug = club.slug;
    let cancelled = false;
    let lastFetch = 0;

    const refresh = () => {
      lastFetch = Date.now();
      fetchPublicSettings()
        .then((settings) => {
          if (cancelled) return;
          const branding = toBranding(settings);
          setClubBranding(branding);
          void storage.setItemAsync(cacheKey(slug), JSON.stringify(branding));
        })
        .catch(() => {
          // Branding is cosmetic — keep whatever palette is showing rather than
          // blocking or showing an error over a failed color fetch.
        });
    };

    storage
      .getItemAsync(cacheKey(slug))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const cached = JSON.parse(raw) as ClubBranding;
          if (cached && typeof cached === "object") setClubBranding(cached);
        } catch {
          /* corrupt cache — ignored, the network fetch below replaces it */
        }
      })
      .catch(() => {});

    refresh();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastFetch > REFRESH_MIN_INTERVAL_MS) refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.slug, club?.apiBaseUrl]);

  return null;
}
