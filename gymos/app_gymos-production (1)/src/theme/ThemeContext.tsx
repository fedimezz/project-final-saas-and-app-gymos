import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance } from "react-native";
import { storage } from "@/lib/storage";
import { buildPalette, type ClubBranding, type Palette } from "@/theme/palette";

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const typography = {
  title: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 },
  h1: { fontSize: 20, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 16, fontWeight: "700" as const, letterSpacing: -0.1 },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: "500" as const, lineHeight: 18 },
  small: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.2 },
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