"use client";
// Choose the 3D hero object and see it LIVE, on the selected theme's backdrop,
// in the club's real brand colors (same WebGL scene the public site uses).
import dynamic from "next/dynamic";
import { Ban, Box, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { HERO_MODELS, getTheme, isUnlocked, resolveHeroChoice, type HeroChoice, type ThemeLayout } from "@/lib/website-themes";
import type { HeroModelTransform } from "@/lib/hero-model";
import type { HeroSceneStatus } from "@/components/themes/hero3d/HeroScene";

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
  salon: "hero-salon text-white",
  grid: "hero-grid text-white",
  platform: "hero-platform text-white",
  street: "hero-street text-white",
  editorial: "hero-editorial",
};

interface Props {
  themeId: string;
  /** The saved choice: a built-in id, "custom", "none", or null (= the theme's default object). */
  heroModel: string | null;
  onChange: (model: HeroChoice | null) => void;
  /** The owner's uploaded model (same-origin URL) with its working placement, if any. */
  custom?: { url: string; transform: HeroModelTransform } | null;
  onSceneStatus?: (status: HeroSceneStatus, detail?: string) => void;
  clubName: string;
  primaryColor: string;
  secondaryColor: string;
  disabled?: boolean;
  /** The club's paid unlocks (GymSettings.premiumUnlocks). Locked premium models can't be picked. */
  premiumUnlocks?: string[];
}

export default function HeroModelPicker({ themeId, heroModel, onChange, custom, onSceneStatus, clubName, primaryColor, secondaryColor, disabled, premiumUnlocks = [] }: Props) {
  const { isDark } = useTheme();
  const theme = getTheme(themeId);
  const choice = resolveHeroChoice(themeId, heroModel);
  const useCustom = choice === "custom" && !!custom;
  const active = choice === "custom" || choice === "none" ? theme.defaultHeroModel : choice; // built-in shown / fallback
  const forcedDark = ["forge", "arena", "ring", "salon", "grid", "platform", "street"].includes(theme.layout);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      {/* Live preview on the theme's own backdrop + typography */}
      <div data-site-theme={theme.id} className="relative overflow-hidden rounded-2xl border border-border" style={{ aspectRatio: "16 / 10" }}>
        <div className={`absolute inset-0 ${BACKDROP[theme.layout]}`} />
        <div className="absolute inset-0">
          {choice === "none" ? (
            <div className="grid h-full place-items-center text-xs text-white/60"><span className="rounded-full bg-black/40 px-3 py-1">Aucun objet 3D</span></div>
          ) : (
            <HeroScene model={active} custom={useCustom ? custom : null} primary={primaryColor} secondary={secondaryColor} isDark={forcedDark || isDark} interactive={false} energy={0.9} onStatus={onSceneStatus} />
          )}
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
        <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1" role="radiogroup" aria-label="Objet 3D de la page d'accueil">
          {HERO_MODELS.map((m) => {
            const selected = choice === m.id;
            const locked = !!m.premium && !selected && !isUnlocked(premiumUnlocks, m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || locked}
                onClick={() => onChange(m.id === theme.defaultHeroModel ? null : m.id)}
                className={`flex items-start justify-between gap-2 rounded-xl border-2 p-3 text-left transition-all disabled:opacity-60 ${
                  selected ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-border hover:border-[var(--primary)]/40"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-primary">
                    {m.name}
                    {m.premium && (
                      <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 align-middle">
                        {locked ? "🔒 Premium" : "Premium"}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted">{m.description}</span>
                </span>
                {selected && <Check size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" aria-hidden />}
              </button>
            );
          })}
          {([
            { id: "custom", name: "Mon modèle 3D", description: custom ? "Votre fichier .glb / .gltf" : "Téléversez-le ci-dessous", icon: Box, disabled: !custom },
            { id: "none", name: "Aucun objet 3D", description: "Titre et décor seulement", icon: Ban, disabled: false },
          ] as const).map((o) => {
            const selected = choice === o.id;
            const Icon = o.icon;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || o.disabled}
                onClick={() => onChange(o.id)}
                className={`flex items-start justify-between gap-2 rounded-xl border-2 border-dashed p-3 text-left transition-all disabled:opacity-50 ${
                  selected ? "border-solid border-[var(--primary)] bg-[var(--primary)]/5" : "border-border hover:border-[var(--primary)]/40"
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-primary"><Icon size={13} aria-hidden />{o.name}</span>
                  <span className="block text-[11px] text-muted">{o.description}</span>
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
