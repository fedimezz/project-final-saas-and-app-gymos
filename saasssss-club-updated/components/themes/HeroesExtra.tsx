"use client";

// The five added theme heroes: Salon (Luxury), Grid (Neon), Platform
// (Powerlifting), Street (Urban) and Editorial (Premium Minimalist). Like the
// original five they are real layouts — not recolors — sharing only the data
// hook, the call-to-action row and the 3D scene from ./Heroes.
import { CtaRow, Scene, useHeroData } from "@/components/themes/Heroes";

// ── 6. SALON (Luxury Fitness Club) ───────────────────────────────────────────
export function SalonHero() {
  const { title, subtitle, clubName } = useHeroData();
  return (
    <section className="hero-salon relative overflow-hidden text-[#f6ecd2]">
      <div className="salon-frame" aria-hidden />
      <div className="relative mx-auto flex min-h-[100svh] max-w-5xl flex-col items-center justify-center px-8 pb-24 pt-32 text-center">
        <p className="t-reveal text-xs uppercase tracking-[0.5em] text-[var(--brand-text,var(--brand))]">{clubName}</p>
        <div className="salon-rule t-reveal mt-5 w-40" aria-hidden />
        <h1 className="theme-heading t-reveal t-reveal-2 salon-gold mt-6 text-5xl leading-[1.05] sm:text-7xl md:text-8xl">{title}</h1>
        <div className="relative my-4 h-[34svh] w-full max-w-md md:h-[40svh]">
          <Scene energy={0.7} forceDark />
        </div>
        {subtitle && <p className="t-reveal t-reveal-3 max-w-xl text-base text-[#f6ecd2]/80 sm:text-lg">{subtitle}</p>}
        <div className="flex justify-center"><CtaRow light /></div>
      </div>
    </section>
  );
}

// ── 7. GRID (Neon Performance) ───────────────────────────────────────────────
export function GridHero() {
  const { title, subtitle } = useHeroData();
  return (
    <section className="hero-grid relative overflow-hidden text-white">
      <span className="neon-glow -left-24 top-10 h-72 w-72" aria-hidden />
      <div className="neon-floor" aria-hidden />
      <div className="relative mx-auto grid min-h-[100svh] max-w-7xl items-center gap-6 px-6 pb-28 pt-28 md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative z-10">
          <span className="neon-tag t-reveal inline-block rounded px-3 py-1 text-[11px] font-bold uppercase tracking-[0.3em]">Performance</span>
          <h1 className="theme-heading t-reveal t-reveal-2 mt-5 text-4xl leading-[1.05] sm:text-6xl md:text-7xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-5 max-w-lg text-lg text-white/75">{subtitle}</p>}
          <CtaRow light />
        </div>
        <div className="relative h-[44svh] md:h-[72svh]">
          <Scene energy={1.2} forceDark />
        </div>
      </div>
    </section>
  );
}

// ── 8. PLATFORM (Powerlifting) ───────────────────────────────────────────────
export function PlatformHero() {
  const { title, subtitle } = useHeroData();
  return (
    <section className="hero-platform relative overflow-hidden text-white">
      <span className="platform-ghost -right-4 top-16 hidden text-[18rem] md:block" aria-hidden>500</span>
      <div className="relative mx-auto grid min-h-[100svh] max-w-7xl items-center gap-6 px-6 pb-32 pt-28 md:grid-cols-2">
        <div className="relative z-10">
          <div className="platform-bar t-reveal mb-6 w-32" aria-hidden />
          <h1 className="theme-heading t-reveal t-reveal-2 text-6xl leading-[0.95] sm:text-7xl md:text-8xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-6 max-w-lg text-lg text-white/75">{subtitle}</p>}
          <CtaRow light />
        </div>
        <div className="relative h-[44svh] md:h-[74svh]">
          <Scene energy={0.8} forceDark />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 space-y-3 pb-6" aria-hidden>
        <div className="platform-chain mx-6" />
        <div className="platform-bar" />
      </div>
    </section>
  );
}

// ── 9. STREET (Urban Street Gym) ─────────────────────────────────────────────
export function StreetHero() {
  const { title, subtitle, clubName } = useHeroData();
  return (
    <section className="hero-street relative overflow-hidden text-white">
      <span className="street-spray -left-16 top-24 h-64 w-64" aria-hidden />
      <span className="street-spray -right-10 bottom-24 h-72 w-72" aria-hidden />
      <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-6 pb-28 pt-28">
        <div className="relative z-10 max-w-3xl">
          <span className="street-stencil t-reveal text-sm">{clubName}</span>
          <h1 className="theme-heading t-reveal t-reveal-2 mt-5 text-6xl leading-[0.95] sm:text-8xl md:text-9xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-5 max-w-xl text-xl text-white/80">{subtitle}</p>}
          <CtaRow light />
        </div>
        <div className="pointer-events-none absolute -right-8 top-1/2 h-[62svh] w-[56vw] max-w-[760px] -translate-y-1/2 md:right-0">
          <Scene energy={1.1} forceDark />
        </div>
      </div>
      <div className="street-tape absolute inset-x-0 bottom-0" aria-hidden />
    </section>
  );
}

// ── 10. EDITORIAL (Premium Minimalist) ───────────────────────────────────────
export function EditorialHero() {
  const { title, subtitle, clubName } = useHeroData();
  return (
    <section className="hero-editorial relative overflow-hidden">
      <div className="mx-auto grid min-h-[100svh] max-w-6xl items-center gap-10 px-6 pb-20 pt-28 md:grid-cols-[1.2fr_0.8fr]">
        <div className="relative z-10">
          <p className="editorial-index t-reveal">{clubName} — 01</p>
          <div className="editorial-rule t-reveal my-6 w-full max-w-sm" aria-hidden />
          <h1 className="theme-heading t-reveal t-reveal-2 text-5xl leading-[1.02] sm:text-7xl md:text-8xl">{title}</h1>
          {subtitle && <p className="t-reveal t-reveal-3 mt-6 max-w-md text-lg opacity-75">{subtitle}</p>}
          <CtaRow />
        </div>
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm border border-current/15 md:max-w-md">
          <Scene energy={0.55} interactive={false} />
        </div>
      </div>
    </section>
  );
}
