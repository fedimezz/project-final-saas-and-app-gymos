"use client";

// The club's home page, composed per theme: its own hero, its own section
// ORDER, its own dividers and its own surface treatment (forced-dark "gym"
// themes vs. light/auto themes). Content and data are the same real club data
// for every theme — only the identity differs.
import type { ReactNode } from "react";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { getTheme, type ThemeLayout } from "@/lib/website-themes";
import { ForgeHero, ArenaHero, RingHero, StudioHero, BentoHero } from "@/components/themes/Heroes";
import { SalonHero, GridHero, PlatformHero, StreetHero, EditorialHero } from "@/components/themes/HeroesExtra";
import ClubIntro from "@/components/home/ClubIntro";
import GallerySection from "@/components/home/GallerySection";
import CalendarPreview from "@/components/home/CalendarPreview";
import CoachesSection from "@/components/home/CoachesSection";
import PricingSection from "@/components/home/PricingSection";
import CTASection from "@/components/home/CTASection";
import PromotionsSection from "@/components/public/PromotionsSection";
import ScrollCompanion from "@/components/themes/ScrollCompanion";
import Reveal from "@/components/themes/Reveal";
import ScrollProgress from "@/components/themes/ScrollProgress";

type SectionKey = "intro" | "gallery" | "calendar" | "coaches" | "pricing" | "offers" | "cta";

const ORDER: Record<ThemeLayout, SectionKey[]> = {
  forge: ["intro", "calendar", "coaches", "pricing", "offers", "gallery", "cta"],
  arena: ["offers", "calendar", "pricing", "coaches", "gallery", "intro", "cta"],
  ring: ["intro", "coaches", "offers", "pricing", "calendar", "gallery", "cta"],
  studio: ["intro", "gallery", "calendar", "coaches", "pricing", "offers", "cta"],
  bento: ["offers", "pricing", "coaches", "calendar", "gallery", "intro", "cta"],
  salon: ["intro", "pricing", "coaches", "gallery", "calendar", "offers", "cta"],
  grid: ["calendar", "pricing", "offers", "coaches", "gallery", "intro", "cta"],
  platform: ["pricing", "intro", "coaches", "calendar", "offers", "gallery", "cta"],
  street: ["calendar", "intro", "coaches", "pricing", "offers", "gallery", "cta"],
  editorial: ["intro", "gallery", "coaches", "pricing", "calendar", "offers", "cta"],
};

const HERO: Record<ThemeLayout, () => ReactNode> = {
  forge: () => <ForgeHero />,
  arena: () => <ArenaHero />,
  ring: () => <RingHero />,
  studio: () => <StudioHero />,
  bento: () => <BentoHero />,
  salon: () => <SalonHero />,
  grid: () => <GridHero />,
  platform: () => <PlatformHero />,
  street: () => <StreetHero />,
  editorial: () => <EditorialHero />,
};

// Gym themes are always dark (steel / arena / ring); studio + bento follow the visitor's light/dark choice.
const FORCE_DARK: Record<ThemeLayout, boolean> = {
  forge: true, arena: true, ring: true, studio: false, bento: false,
  salon: true, grid: true, platform: true, street: true, editorial: false,
};

function Divider({ layout }: { layout: ThemeLayout }) {
  if (layout === "forge") return <div className="forge-plate-line" aria-hidden />;
  if (layout === "arena") return <div className="t-stripes" aria-hidden />;
  if (layout === "ring") {
    return (
      <div className="bg-[#0a0807] px-6 py-3" aria-hidden>
        <div className="ring-rope" />
      </div>
    );
  }
  if (layout === "studio") {
    return (
      <svg viewBox="0 0 1440 48" preserveAspectRatio="none" className="block h-8 w-full text-[var(--brand)] opacity-30" aria-hidden>
        <path d="M0 24 C 240 0, 480 48, 720 24 S 1200 0, 1440 24 V48 H0Z" fill="currentColor" />
      </svg>
    );
  }
  if (layout === "salon") return <div className="salon-rule bg-[#0b0a09]" aria-hidden />;
  if (layout === "grid") {
    return <div className="h-px bg-[var(--brand)] opacity-60 shadow-[0_0_16px_var(--brand)]" aria-hidden />;
  }
  if (layout === "platform") {
    return (
      <div className="space-y-2 bg-[#0d0d0f] py-3" aria-hidden>
        <div className="platform-chain mx-6" />
        <div className="platform-bar" />
      </div>
    );
  }
  if (layout === "street") return <div className="street-tape" aria-hidden />;
  if (layout === "editorial") return <div className="editorial-rule mx-auto max-w-6xl text-[var(--text-primary)]" aria-hidden />;
  return null;
}

export default function ThemedHome() {
  const { themeId } = useClubSettings();
  const preset = getTheme(themeId);
  const layout = preset.layout;

  const sections: Record<SectionKey, ReactNode> = {
    intro: <ClubIntro />,
    gallery: <GallerySection />,
    calendar: <CalendarPreview />,
    coaches: <CoachesSection />,
    pricing: <PricingSection />,
    offers: <PromotionsSection className="theme-section py-20" />,
    cta: <CTASection />,
  };

  return (
    <div className={`theme-scope ${FORCE_DARK[layout] ? "dark bg-[var(--bg-primary)] text-[var(--text-primary)]" : ""}`} data-theme-layout={layout}>
      <ScrollProgress />
      {HERO[layout]()}
      {/* One 3D object that travels down the page with the visitor. */}
      <ScrollCompanion forceDark={FORCE_DARK[layout]} />
      {ORDER[layout].map((key) => (
        <div key={key}>
          <Divider layout={layout} />
          <Reveal>{sections[key]}</Reveal>
        </div>
      ))}
    </div>
  );
}
