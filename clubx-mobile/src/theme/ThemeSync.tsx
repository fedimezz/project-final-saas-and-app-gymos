import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import { useBrand } from "@/brand/BrandContext";
import { fetchPublicSettings } from "@/api/settings";
import { storage } from "@/lib/storage";
import { parseClubBrand, type ClubBrand } from "@/lib/clubBrand";
import { SUPPORTED_HERO_MODELS } from "@/hero3d/heroModels.generated";
import type { ClubBranding } from "@/theme/palette";

// Renders nothing — keeps the app's identity in sync with what the club owner
// chose on the website (name, logo, theme preset or custom colors, 3D hero):
//  1. instant paint from the last brand cached for this club (no flash of the
//     neutral palette on launch),
//  2. refetch from /api/settings/public (public, cached server-side),
//  3. refetch whenever the app returns to the foreground, so a change by the
//     owner shows up without reinstalling or restarting the app.
// With no club selected the brand is cleared: the screens then show ClubX.
// Kept separate from the auth/theme providers so neither needs to know the other.
const REFRESH_MIN_INTERVAL_MS = 60_000;
const cacheKey = (slug: string) => `gymos.brand.v2.${slug.replace(/[^A-Za-z0-9._-]/g, "_")}`;

function toPalette(brand: ClubBrand, raw: { backgroundColor?: string | null; backgroundColorDark?: string | null }): ClubBranding {
  return {
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    backgroundColor: raw.backgroundColor,
    backgroundColorDark: raw.backgroundColorDark,
  };
}

interface Cached {
  brand: ClubBrand;
  palette: ClubBranding;
}

export default function ThemeSync() {
  const { club } = useAuth();
  const { setClubBranding } = useTheme();
  const { setBrand } = useBrand();

  useEffect(() => {
    if (!club) {
      setClubBranding(null);
      setBrand(null);
      return;
    }
    const slug = club.slug;
    let cancelled = false;
    let lastFetch = 0;

    const apply = ({ brand, palette }: Cached) => {
      // The club chosen at login already has a name/logo even before the
      // settings answer: never replace a known name with an empty one.
      setBrand({ ...brand, name: brand.name || club.name, logoUrl: brand.logoUrl ?? club.logoUrl ?? null });
      setClubBranding(palette);
    };

    const refresh = () => {
      lastFetch = Date.now();
      fetchPublicSettings()
        .then((settings) => {
          if (cancelled) return;
          const brand = parseClubBrand(settings, SUPPORTED_HERO_MODELS);
          const cached: Cached = { brand, palette: toPalette(brand, settings) };
          apply(cached);
          void storage.setItemAsync(cacheKey(slug), JSON.stringify(cached));
        })
        .catch(() => {
          // Branding is cosmetic — keep whatever is showing rather than
          // blocking or showing an error over a failed fetch.
        });
    };

    // Until the cache / network answers, show the club the person picked.
    setBrand(parseClubBrand({ name: club.name, logoUrl: club.logoUrl }, SUPPORTED_HERO_MODELS));

    storage
      .getItemAsync(cacheKey(slug))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const cached = JSON.parse(raw) as Partial<Cached>;
          if (cached && typeof cached === "object" && cached.brand && cached.palette) {
            // Re-validate: the cache could come from an older app version.
            apply({ brand: parseClubBrand(cached.brand, SUPPORTED_HERO_MODELS), palette: cached.palette });
          }
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
