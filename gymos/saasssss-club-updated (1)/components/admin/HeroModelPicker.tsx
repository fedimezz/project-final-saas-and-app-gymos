"use client";
// Choose the 3D hero object and see it LIVE, on the selected theme's backdrop,
// in the club's real brand colors (same WebGL scene the public site uses).
import dynamic from "next/dynamic";
import { Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { HERO_MODELS, getTheme, resolveHeroModel, type HeroModelId, type ThemeLayout } from "@/lib/website-themes";

const HeroScene = dynamic(() => import("@/components/themes/hero3d/HeroScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-xs text-white/60">Chargement de l&apos;aperçu 3D…</div>,
});

const BACKDROP: Record<ThemeLayout, string> = {
  forge: "hero-forge text-white",
  arena: "hero-arena text-white",
  ring: "hero-ring text-white",
  studio: "hero-studio",
  bento: "hero-bento",
};

interface Props {
  themeId: string;
  /** The saved choice (null = the theme's default object). */
  heroModel: string | null;
  onChange: (model: HeroModelId | null) => void;
  clubName: string;
  primaryColor: string;
  secondaryColor: string;
  disabled?: boolean;
}

export default function HeroModelPicker({ themeId, heroModel, onChange, clubName, primaryColor, secondaryColor, disabled }: Props) {
  const { isDark } = useTheme();
  const theme = getTheme(themeId);
  const active = resolveHeroModel(themeId, heroModel);
  const forcedDark = theme.layout === "forge" || theme.layout === "arena" || theme.layout === "ring";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      {/* Live preview on the theme's own backdrop + typography */}
      <div data-site-theme={theme.id} className="relative overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: "16 / 10" }}>
        <div className={`absolute inset-0 ${BACKDROP[theme.layout]}`} />
        <div className="absolute inset-0">
          <HeroScene model={active} primary={primaryColor} secondary={secondaryColor} isDark={forcedDark || isDark} interactive={false} energy={0.9} />
        </div>
        <div className="pointer-events-none absolute left-4 top-3 right-4 flex items-center justify-between">
          <span className="theme-heading truncate text-xl" style={{ color: forcedDark ? "#fff" : "var(--text-primary)" }}>{clubName || "Votre club"}</span>
          <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Aperçu en direct</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted">
          Objet conseillé pour {theme.name} : <strong className="text-primary">{HERO_MODELS.find((m) => m.id === theme.defaultHeroModel)?.name}</strong>. Vous pouvez en choisir un autre.
        </p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Objet 3D de la page d'accueil">
          {HERO_MODELS.map((m) => {
            const selected = m.id === active;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(m.id === theme.defaultHeroModel ? null : m.id)}
                className={`flex items-start justify-between gap-2 rounded-xl border-2 p-3 text-left transition-all disabled:opacity-60 ${
                  selected ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-border hover:border-[var(--primary)]/40"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary">{m.name}</span>
                  <span className="block text-[11px] text-muted">{m.description}</span>
                </span>
                {selected && <Check size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
