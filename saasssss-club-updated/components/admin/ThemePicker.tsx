"use client";
// ThemePicker — the 10 website themes (lib/website-themes.ts). Each card is a
// mini mock-up of THAT theme's real hero layout, typography and motion mood —
// not just a color swatch — so owners see how different the sites really are.
// Purely a controlled input: the parent owns the selected id and decides what
// to stage (theme id, default colors, default 3D model).
import { Check } from "lucide-react";
import { THEME_PRESETS, resolveThemeId, isUnlocked, type ThemePreset } from "@/lib/website-themes";

interface ThemePickerProps {
  selectedId: string;
  onSelect: (theme: ThemePreset) => void;
  disabled?: boolean;
  clubName?: string;
  /** Live brand colors to show in the previews (defaults to each theme's own). */
  primaryColor?: string;
  secondaryColor?: string;
  /** The club's paid unlocks (GymSettings.premiumUnlocks). Locked premium themes can't be picked. */
  premiumUnlocks?: string[];
}

function MiniPreview({ theme, clubName, primary, secondary }: { theme: ThemePreset; clubName: string; primary: string; secondary: string }) {
  const font = `"${theme.headingFont}", Impact, serif`;
  const fg = theme.previewText;
  const base: React.CSSProperties = { backgroundColor: theme.previewBg, color: fg };

  if (theme.layout === "forge") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: "repeating-linear-gradient(115deg, rgba(255,255,255,.04) 0 2px, transparent 2px 7px)" }}>
        <div className="mb-1.5 h-1 w-10" style={{ background: primary }} />
        <p className="truncate text-2xl uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".02em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.12em]" style={{ background: primary, color: "#111", borderRadius: 2 }}>Rejoindre</span>
        <div className="absolute -right-2 top-4 h-16 w-16 rounded-full" style={{ background: `radial-gradient(circle at 35% 35%, ${secondary}, #222 70%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-5 text-[10px] uppercase tracking-[.2em]" style={{ background: primary, color: "#111", clipPath: "polygon(0 0,100% 0,100% 70%,0 100%)", fontFamily: font }}>
          <span className="pl-3 pt-1 inline-block">{clubName} ◆ {clubName} ◆</span>
        </div>
      </div>
    );
  }
  if (theme.layout === "arena") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `linear-gradient(135deg, transparent 0 62%, ${primary} 62% 70%, transparent 70% 74%, ${secondary} 74% 78%, transparent 78%)` }}>
        <p className="text-sm tabular-nums" style={{ fontFamily: font, color: primary }}>12:34</p>
        <p className="truncate text-3xl font-extrabold uppercase italic leading-none" style={{ fontFamily: font }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.08em]" style={{ background: primary, color: "#fff", borderRadius: 4 }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${primary} 0 8px, #0b0b0c 8px 16px)` }} />
      </div>
    );
  }
  if (theme.layout === "ring") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3 text-center" style={{ ...base, backgroundImage: "radial-gradient(ellipse 60% 70% at 50% 0%, rgba(255,244,214,.25), transparent 65%)" }}>
        <p className="text-[9px] tracking-[.5em]" style={{ color: primary }}>★ ★ ★</p>
        <p className="truncate text-3xl uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".06em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em]" style={{ background: primary, color: "#fff", borderRadius: 3 }}>Rejoindre</span>
        <div className="absolute inset-x-3 bottom-2 space-y-1">
          {[primary, "#fafafa", primary].map((c, i) => <div key={i} className="h-[3px] rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />)}
        </div>
      </div>
    );
  }
  if (theme.layout === "studio") {
    return (
      <div className="relative grid h-36 grid-cols-[1.2fr_.8fr] items-center gap-2 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `radial-gradient(60% 60% at 15% 20%, ${primary}33, transparent 70%), radial-gradient(50% 55% at 90% 80%, ${secondary}44, transparent 70%)` }}>
        <div>
          <div className="mb-2 h-px w-8" style={{ background: primary }} />
          <p className="truncate text-2xl leading-none" style={{ fontFamily: font, fontWeight: 500 }}>{clubName}</p>
          <span className="mt-2 inline-block rounded-full px-3 py-1 text-[9px] font-semibold" style={{ background: primary, color: "#fff" }}>Rejoindre</span>
        </div>
        <div className="mx-auto h-full w-14" style={{ borderRadius: "999px 999px 14px 14px", background: `linear-gradient(180deg, ${primary}33, ${secondary}44)`, boxShadow: `inset 0 0 0 1px ${primary}44` }} />
      </div>
    );
  }
  if (theme.layout === "salon") {
    return (
      <div className="relative flex h-36 flex-col items-center justify-center overflow-hidden rounded-lg p-3 text-center" style={{ ...base, backgroundImage: `radial-gradient(ellipse 60% 60% at 50% 40%, ${primary}33, transparent 70%)` }}>
        <div className="absolute inset-2" style={{ border: `1px solid ${primary}77` }} />
        <p className="text-[8px] uppercase tracking-[.4em]" style={{ color: primary }}>{clubName}</p>
        <div className="my-1.5 h-px w-16" style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }} />
        <p className="truncate text-2xl leading-none" style={{ fontFamily: font, color: primary }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-semibold uppercase tracking-[.24em]" style={{ border: `1px solid ${primary}`, color: primary }}>Rejoindre</span>
      </div>
    );
  }
  if (theme.layout === "grid") {
    return (
      <div className="relative h-36 overflow-hidden rounded-lg p-3" style={{ ...base, backgroundImage: `radial-gradient(ellipse 60% 50% at 75% 30%, ${primary}33, transparent 70%)` }}>
        <span className="inline-block rounded px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[.3em]" style={{ border: `1px solid ${primary}`, color: primary, boxShadow: `0 0 8px ${primary}66` }}>Performance</span>
        <p className="mt-1.5 truncate text-lg font-extrabold uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".05em", textShadow: `0 0 12px ${primary}88` }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.14em]" style={{ background: primary, color: "#031", borderRadius: 3, boxShadow: `0 0 12px ${primary}88` }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-12" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${primary}55 0 1px, transparent 1px 14px), repeating-linear-gradient(0deg, ${primary}55 0 1px, transparent 1px 10px)`, maskImage: "linear-gradient(to top, #000, transparent)", WebkitMaskImage: "linear-gradient(to top, #000, transparent)" }} />
      </div>
    );
  }
  if (theme.layout === "platform") {
    return (
      <div className="relative h-36 overflow-hidden p-3" style={{ ...base, borderRadius: 0, backgroundImage: `linear-gradient(180deg, transparent 70%, ${primary}55)` }}>
        <p className="absolute -right-1 top-3 text-6xl font-bold leading-none" style={{ fontFamily: font, color: "transparent", WebkitTextStroke: `1px ${primary}88` }}>500</p>
        <div className="mb-1.5 h-1.5 w-12" style={{ background: secondary }} />
        <p className="truncate text-2xl font-bold uppercase leading-none" style={{ fontFamily: font, letterSpacing: ".04em" }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.18em]" style={{ background: primary, color: "#fff", boxShadow: "3px 3px 0 #000" }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: `linear-gradient(90deg, ${secondary}, #d4d4d8 30%, ${secondary})` }} />
      </div>
    );
  }
  if (theme.layout === "street") {
    return (
      <div className="relative h-36 overflow-hidden rounded-sm p-3" style={{ ...base, backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.4px)", backgroundSize: "7px 7px" }}>
        <span className="inline-block px-1.5 py-0.5 text-[8px] uppercase tracking-[.18em]" style={{ border: `2px solid ${primary}`, color: primary, transform: "rotate(-3deg)", fontFamily: font }}>{clubName}</span>
        <p className="mt-2 truncate text-3xl uppercase leading-none" style={{ fontFamily: font }}>{clubName}</p>
        <span className="mt-2 inline-block px-3 py-1 text-[8px] font-bold uppercase tracking-[.1em]" style={{ background: primary, color: "#111", borderRadius: 2 }}>Rejoindre</span>
        <div className="absolute inset-x-0 bottom-0 h-2.5" style={{ backgroundImage: `repeating-linear-gradient(-45deg, ${primary} 0 8px, #151517 8px 16px)` }} />
      </div>
    );
  }
  if (theme.layout === "editorial") {
    return (
      <div className="relative grid h-36 grid-cols-[1.2fr_.8fr] items-center gap-3 overflow-hidden p-3" style={{ ...base, borderRadius: 0 }}>
        <div>
          <p className="text-[7px] uppercase tracking-[.3em] opacity-60">{clubName} — 01</p>
          <div className="my-1.5 h-px w-full opacity-20" style={{ background: "currentColor" }} />
          <p className="truncate text-2xl font-semibold leading-none" style={{ fontFamily: font, letterSpacing: "-.04em" }}>{clubName}</p>
          <span className="mt-2 inline-block px-3 py-1 text-[8px] font-semibold uppercase tracking-[.2em]" style={{ background: secondary, color: theme.previewBg }}>Rejoindre</span>
        </div>
        <div className="h-full" style={{ border: "1px solid rgba(47,43,40,.2)", background: `linear-gradient(160deg, ${primary}33, transparent)` }} />
      </div>
    );
  }
  return (
    <div className="grid h-36 grid-cols-12 grid-rows-2 gap-1.5 rounded-lg p-2" style={{ ...base, backgroundImage: `radial-gradient(60% 50% at 10% 0%, ${primary}33, transparent 70%)` }}>
      <div className="col-span-7 row-span-1 rounded-xl p-2" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(15,23,42,.08)" }}>
        <p className="truncate text-base font-bold leading-none" style={{ fontFamily: font, letterSpacing: "-.03em" }}>{clubName}</p>
        <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-semibold text-white" style={{ background: primary }}>Rejoindre</span>
      </div>
      <div className="col-span-5 row-span-2 rounded-xl" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
      <div className="col-span-7 rounded-xl" style={{ background: "rgba(255,255,255,.7)", border: "1px solid rgba(15,23,42,.08)" }} />
    </div>
  );
}

export default function ThemePicker({ selectedId, onSelect, disabled, clubName, primaryColor, secondaryColor, premiumUnlocks = [] }: ThemePickerProps) {
  const current = resolveThemeId(selectedId);
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" role="radiogroup" aria-label="Thème du site">
      {THEME_PRESETS.map((theme) => {
        const selected = theme.id === current;
        const locked = !!theme.premium && !selected && !isUnlocked(premiumUnlocks, theme.id);
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || locked}
            onClick={() => onSelect(theme)}
            className={`text-left rounded-2xl border-2 overflow-hidden transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              selected ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-border hover:border-[var(--primary)]/40"
            }`}
          >
            <div className="p-2.5 bg-muted/30">
              <MiniPreview theme={theme} clubName={clubName || "Votre club"} primary={primaryColor || theme.primaryColor} secondary={secondaryColor || theme.secondaryColor} />
            </div>
            <div className="p-3.5 flex items-start justify-between gap-2 bg-card">
              <div className="min-w-0">
                <p className="font-semibold text-primary text-sm">
                  {theme.name}
                  {theme.premium && (
                    <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 align-middle">
                      {locked ? "🔒 Premium" : "Premium"}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted mt-0.5">{theme.description}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"}`}>
                {selected && <Check size={11} className="text-white" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
