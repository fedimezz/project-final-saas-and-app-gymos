"use client";

// The five theme heroes. Each one is a genuinely different layout (not a
// recolor): Forge (musculation), Arena (crossfit), Ring (boxing), Studio
// (yoga) and Bento (modern). They share data + the 3D scene, nothing else.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { getTheme } from "@/lib/website-themes";
import { postLoginPath } from "@/lib/post-login-path";

// `three` is code-split: it is only fetched when a hero actually mounts.
const HeroScene = dynamic(() => import("@/components/themes/hero3d/HeroScene"), { ssr: false, loading: () => null });

function useHeroData() {
  const { isDark } = useTheme();
  const { isLoggedIn, userRole } = useAuth();
  const s = useClubSettings();
  const preset = getTheme(s.themeId);
  const cta = !isLoggedIn
    ? { label: "Rejoindre maintenant", href: "/user/register" }
    : { label: userRole?.toUpperCase() === "ADMIN" || userRole?.toUpperCase() === "OWNER" ? "Tableau de bord" : "Mon espace", href: postLoginPath(userRole) };
  return {
    isDark,
    cta,
    title: s.heroTitle || s.name,
    subtitle: s.heroSubtitle,
    clubName: s.name,
    model: s.heroModel,
    primary: s.primaryColor || preset.primaryColor,
    secondary: s.secondaryColor || preset.secondaryColor,
    pages: s.enabledPages,
  };
}

function Scene({ energy = 1, interactive = true, forceDark }: { energy?: number; interactive?: boolean; forceDark?: boolean }) {
  const d = useHeroData();
  return (
    <HeroScene model={d.model} primary={d.primary} secondary={d.secondary} isDark={forceDark ?? d.isDark} energy={energy} interactive={interactive} />
  );
}

function CtaRow({ light = false }: { light?: boolean }) {
  const { cta, pages } = useHeroData();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Link href={cta.href} className="theme-btn inline-block px-8 py-3.5 font-bold shadow-lg">
        {cta.label}
      </Link>
      {pages.offres && (
        <Link href="/offres" className={`theme-btn-ghost inline-block px-7 py-3 font-semibold ${light ? "text-white" : "text-[var(--text-primary)]"}`}>
          Voir les offres
        </Link>
      )}
    </div>
  );
}

// ── 1. FORGE (Musculation) ───────────────────────────────────────────────────
export function ForgeHero() {
  const { title, subtitle, clubName } = useHeroData();
  const words = Array.from({ length: 8 }, () => clubName);
  return (
    <section className="hero-forge relative overflow-hidden text-white">
      <div className="mx-auto grid min-h-[100svh] max-w-7xl items-center gap-6 px-6 pb-32 pt-28 md:grid-cols-2">
        <div className="relative z-10">
          <div className="forge-plate-line mb-6 w-28 t-reveal" aria-hidden />
          <h1 className="theme-heading t-reveal t-reveal-2 text-6xl leading-[0.95] sm:text-7xl md:text-8xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-6 max-w-lg text-lg text-white/80">{subtitle}</p>}
          <CtaRow light />
        </div>
        <div className="relative h-[46svh] md:h-[78svh]">
          <Scene energy={0.85} forceDark />
        </div>
      </div>
      {/* heavy diagonal base + scrolling name strip */}
      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="forge-edge bg-[var(--brand)] pt-10 pb-3 text-[var(--brand-contrast)]">
          <div className="overflow-hidden" aria-hidden>
            <div className="t-marquee-track theme-heading text-2xl tracking-[0.2em]">
              {[...words, ...words].map((w, i) => (
                <span key={i} className="px-6">{w} ◆</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 2. ARENA (CrossFit) ──────────────────────────────────────────────────────
function Timer() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSec((s) => (s + 1) % 3600), 1000);
    return () => window.clearInterval(id);
  }, []);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return (
    <span className="arena-timer text-5xl text-[var(--brand)] md:text-7xl" aria-hidden>
      {mm}:{ss}
    </span>
  );
}

export function ArenaHero() {
  const { title, subtitle } = useHeroData();
  return (
    <section className="hero-arena relative overflow-hidden text-white">
      <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-6 py-28">
        <div className="relative z-10 max-w-3xl">
          <div className="t-reveal flex items-center gap-4">
            <Timer />
          </div>
          <h1 className="theme-heading arena-italic t-reveal t-reveal-2 mt-4 text-6xl sm:text-8xl md:text-9xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-5 max-w-xl text-xl text-white/85">{subtitle}</p>}
          <CtaRow light />
        </div>
        <div className="pointer-events-none absolute -right-10 top-1/2 h-[70svh] w-[60vw] max-w-[820px] -translate-y-1/2 md:right-0">
          <Scene energy={1.35} forceDark />
        </div>
      </div>
      <div className="t-stripes absolute inset-x-0 bottom-0" aria-hidden />
    </section>
  );
}

// ── 3. RING (Boxing) ─────────────────────────────────────────────────────────
export function RingHero() {
  const { title, subtitle } = useHeroData();
  return (
    <section className="hero-ring relative overflow-hidden text-white">
      <div className="ring-spot pointer-events-none absolute inset-x-0 top-0 h-full" aria-hidden />
      <div className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-6 pb-24 pt-28 text-center">
        <p className="t-reveal text-lg tracking-[0.6em] text-[var(--brand)]" aria-hidden>★ ★ ★</p>
        <h1 className="theme-heading t-reveal t-reveal-2 mt-3 text-7xl sm:text-8xl md:text-[9.5rem]">{title}</h1>
        <div className="relative my-2 h-[38svh] w-full max-w-xl md:h-[44svh]">
          <Scene energy={1} forceDark />
        </div>
        {subtitle && <p className="t-reveal t-reveal-3 max-w-xl text-lg text-white/80">{subtitle}</p>}
        <div className="flex justify-center"><CtaRow light /></div>
      </div>
      {/* ring ropes + corner posts */}
      <div className="absolute inset-x-6 bottom-8 space-y-3 md:inset-x-16" aria-hidden>
        <div className="ring-rope" />
        <div className="ring-rope alt" />
        <div className="ring-rope" />
      </div>
      <div className="absolute bottom-4 left-4 h-24 w-3 rounded bg-[var(--brand)] md:left-12" aria-hidden />
      <div className="absolute bottom-4 right-4 h-24 w-3 rounded bg-[var(--brand)] md:right-12" aria-hidden />
    </section>
  );
}

// ── 4. STUDIO (Yoga & Bien-être) ─────────────────────────────────────────────
export function StudioHero() {
  const { title, subtitle } = useHeroData();
  return (
    <section className="hero-studio relative overflow-hidden text-[var(--text-primary)]">
      <span className="t-blob -left-20 top-24 h-72 w-72" aria-hidden />
      <span className="t-blob -right-16 bottom-10 h-64 w-64" style={{ background: "var(--brand-2)", animationDelay: "3s" }} aria-hidden />
      <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-center gap-10 px-6 pb-20 pt-28 md:grid-cols-[1.1fr_0.9fr]">
        <div className="relative z-10 text-center md:text-left">
          <div className="t-reveal mx-auto h-px w-20 bg-[var(--brand)] md:mx-0" aria-hidden />
          <h1 className="theme-heading t-reveal t-reveal-2 mt-6 text-6xl sm:text-7xl md:text-8xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mx-auto mt-6 max-w-md text-lg text-[var(--text-secondary)] md:mx-0">{subtitle}</p>}
          <div className="flex justify-center md:justify-start"><CtaRow /></div>
        </div>
        <div className="studio-arch relative mx-auto aspect-[3/4] w-full max-w-sm md:max-w-md">
          <Scene energy={0.6} interactive={false} />
        </div>
      </div>
    </section>
  );
}

// ── 5. BENTO (Fitness moderne) ───────────────────────────────────────────────
function BentoTile({ href, title, hint, icon }: { href: string; title: string; hint: string; icon: ReactNode }) {
  return (
    <Link href={href} className="bento-glass theme-card group flex items-center gap-4 p-5">
      <span className="bento-grad grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="theme-heading block text-lg text-[var(--text-primary)]">{title}</span>
        <span className="block truncate text-sm text-[var(--text-muted)]">{hint}</span>
      </span>
      <span className="ml-auto text-[var(--text-muted)] transition group-hover:translate-x-1" aria-hidden>→</span>
    </Link>
  );
}

export function BentoHero() {
  const { title, subtitle, pages } = useHeroData();
  return (
    <section className="hero-bento relative overflow-hidden">
      <div className="mx-auto grid min-h-[100svh] max-w-7xl grid-cols-1 gap-4 px-4 pb-16 pt-24 md:grid-cols-12 md:grid-rows-[1fr_auto_auto] md:px-6">
        <div className="bento-glass theme-card t-reveal flex flex-col justify-center p-8 md:col-span-7 md:row-span-1 md:p-12">
          <h1 className="theme-heading text-5xl text-[var(--text-primary)] sm:text-6xl md:text-7xl">{title}</h1>
          {subtitle && <p className="mt-5 max-w-lg text-lg text-[var(--text-secondary)]">{subtitle}</p>}
          <CtaRow />
        </div>
        <div className="bento-grad theme-card t-reveal t-reveal-2 relative min-h-[320px] overflow-hidden md:col-span-5 md:row-span-3">
          <Scene energy={1} />
        </div>
        {pages.offres && <div className="t-reveal t-reveal-2 md:col-span-7 md:col-start-1"><BentoTile href="/offres" title="Nos offres" hint="Abonnements et promotions" icon="✦" /></div>}
        {pages.coaching && <div className="t-reveal t-reveal-3 md:col-span-7 md:col-start-1"><BentoTile href="/coaching" title="Nos coachs" hint="Rencontrez l'équipe" icon="◎" /></div>}
      </div>
    </section>
  );
}
