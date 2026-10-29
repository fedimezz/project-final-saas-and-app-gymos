import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { storage } from "@/lib/storage";
import { buildPalette, type ClubBranding, type Palette } from "@/theme/palette";

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const typography = {
  display: { fontSize: 34, fontWeight: "800" as const, letterSpacing: -1, lineHeight: 38 },
  title: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.7, lineHeight: 33 },
  h1: { fontSize: 21, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 26 },
  h2: { fontSize: 16, fontWeight: "700" as const, letterSpacing: -0.15, lineHeight: 21 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "500" as const, lineHeight: 18 },
  small: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.3 },
  // Small uppercase section label ("AUJOURD'HUI", plan tier…).
  overline: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.1, textTransform: "uppercase" as const },
  // Prices, counts and times: equal-width digits so figures line up and don't jitter.
  numeric: { fontWeight: "800" as const, letterSpacing: -0.5, fontVariant: ["tabular-nums" as const] },
};

type ThemeMode = "light" | "dark" | "system";
const THEME_MODE_KEY = "gymos.themeMode";

interface ThemeContextValue {
  colors: Palette;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  setClubBranding: (branding: ClubBranding | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());
  const [clubBranding, setClubBranding] = useState<ClubBranding | null>(null);

  useEffect(() => {
    storage.getItemAsync(THEME_MODE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
    });
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => sub.remove();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void storage.setItemAsync(THEME_MODE_KEY, next);
  };

  const isDark = mode === "system" ? systemScheme === "dark" : mode === "dark";
  const colors = useMemo(() => buildPalette(clubBranding, isDark), [clubBranding, isDark]);

  const value = useMemo(
      () => ({ colors, isDark, mode, setMode, setClubBranding }),
      [colors, isDark, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}