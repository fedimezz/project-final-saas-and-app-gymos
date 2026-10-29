"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return systemPrefersDark ? "dark" : "light";
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // IMPORTANT: always initialize to "light" here, identically on server
  // and client. The server can never know localStorage, so if this
  // initial value depends on localStorage/matchMedia, server and client
  // markup will disagree on the very first render and React will throw a
  // hydration error (and then re-render the whole tree client-side,
  // which is the bug you just hit).
  //
  // The real (possibly-dark) theme is applied in the effect below, AFTER
  // mount. The inline script in layout.tsx (see comment there) is what
  // prevents a flash-of-light-mode before that effect runs — it sets the
  // "dark" class on <html> before React even hydrates, completely
  // outside of React's render cycle, so it can't cause a mismatch.
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Runs once on mount, client-only. Reconciles React state with
    // whatever the inline script already applied to <html>, so re-renders
    // triggered by anything else don't accidentally strip the dark class.
    const initial = readStoredTheme();
    setTheme(initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    // Skip the very first run: before mount, the inline script (not this
    // effect) is responsible for the DOM class, and theme is still "light"
    // here regardless of the real stored value, so applying it would
    // briefly flash light mode before the mount effect above corrects it.
    if (!mounted) return;
    applyThemeClass(theme);
  }, [theme, mounted]);

  // Cross-tab sync only. We no longer dispatch or listen for a custom
  // same-tab event — React state + the effect above already keeps this
  // tab's UI and the <html> class in sync. Listening for an event that
  // toggleTheme also dispatches was the bug: it caused every click to run
  // two redundant (and potentially racing) state updates.
  useEffect(() => {
    const syncFromOtherTab = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      setTheme(readStoredTheme());
    };
    window.addEventListener("storage", syncFromOtherTab);
    return () => window.removeEventListener("storage", syncFromOtherTab);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}