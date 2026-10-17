"use client";

import { Globe, Moon, Sun, Loader2 } from "lucide-react";

type Language = "FR" | "EN" | "AR";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "FR", label: "Français" },
  { value: "EN", label: "English" },
  { value: "AR", label: "العربية" },
];

interface Props {
  language: Language;
  darkMode: boolean;
  savingLanguage: boolean;
  savingTheme: boolean;
  onLanguageChange: (lang: Language) => void;
  onThemeToggle: () => void;
}

export default function GeneralPreferencesCard({
  language,
  darkMode,
  savingLanguage,
  savingTheme,
  onLanguageChange,
  onThemeToggle,
}: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <h3 className="font-semibold text-primary mb-1">Préférences générales</h3>
      <p className="text-sm text-muted mb-2">Langue et apparence de l&apos;application.</p>

      {/* Language */}
      <div className="flex items-center justify-between py-3.5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
            <Globe size={16} className="text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Langue</p>
            <p className="text-xs text-muted">Langue de l&apos;interface</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savingLanguage && <Loader2 size={14} className="animate-spin text-muted" />}
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as Language)}
            disabled={savingLanguage}
            className="px-3 py-1.5 rounded-lg bg-muted border border-border text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Theme */}
      <div className="flex items-center justify-between py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
            {darkMode ? (
              <Moon size={16} className="text-[var(--primary)]" />
            ) : (
              <Sun size={16} className="text-[var(--primary)]" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-primary">Mode sombre</p>
            <p className="text-xs text-muted">Basculer entre clair et sombre</p>
          </div>
        </div>

        <button
          onClick={onThemeToggle}
          disabled={savingTheme}
          role="switch"
          aria-checked={darkMode}
          aria-label="Mode sombre"
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
            darkMode ? "bg-[var(--primary)]" : "bg-muted"
          }`}
        >
          {savingTheme ? (
            <Loader2
              size={12}
              className="animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
            />
          ) : (
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                darkMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
}