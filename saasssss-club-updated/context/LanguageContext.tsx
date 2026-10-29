"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { translate, type Lang } from "@/lib/i18n/dictionary";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang, opts?: { persist?: boolean }) => Promise<void>;
  t: (key: string, fallback?: string) => string;
  saving: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "FR",
  setLang: async () => {},
  t: (key, fallback) => fallback ?? key,
  saving: false,
});

const STORAGE_KEY = "lang";

function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang.toLowerCase();
  document.documentElement.dir = lang === "AR" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [lang, setLangState] = useState<Lang>("FR");
  const [saving, setSaving] = useState(false);

  // Initial load: prefer the logged-in user's saved preference; otherwise
  // fall back to whatever a guest previously picked on this browser.
  useEffect(() => {
    let active = true;
    async function load() {
      if (isLoggedIn) {
        try {
          const res = await fetch("/api/dashboard/settings", { credentials: "include" });
          if (res.ok) {
            const json = await res.json();
            const saved = json.preferences?.language as Lang | undefined;
            if (active && saved) {
              setLangState(saved);
              applyDocumentLang(saved);
              return;
            }
          }
        } catch {
          // fall through to local fallback
        }
      }
      const stored = (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null) as Lang | null;
      const initial = stored ?? "FR";
      if (active) {
        setLangState(initial);
        applyDocumentLang(initial);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [isLoggedIn]);

  const setLang = useCallback(
    async (next: Lang, opts?: { persist?: boolean }) => {
      setLangState(next);
      applyDocumentLang(next);
      localStorage.setItem(STORAGE_KEY, next);

      if (opts?.persist === false) return;
      if (!isLoggedIn) return; // guests: localStorage only, nothing to save server-side

      setSaving(true);
      try {
        await fetch("/api/dashboard/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ language: next }),
        });
      } catch {
        // Non-fatal — the UI already switched language locally.
      } finally {
        setSaving(false);
      }
    },
    [isLoggedIn]
  );

  const t = useCallback((key: string, fallback?: string) => translate(lang, key, fallback), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, saving }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
