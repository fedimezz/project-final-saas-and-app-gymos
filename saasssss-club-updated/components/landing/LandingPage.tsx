// LandingPage — composes all SaaS marketing sections. Rendered by
// app/(public)/page.tsx only when useClubSettings().hasTenant is false
// (no resolved gym subdomain — i.e. the platform's own site).
// Navbar/Footer are NOT included here: components/layout/Navbar.tsx and
// Footer.tsx already render LandingNavbar/LandingFooter around this page
// via RootShell, so this component only owns the sections in between.
//
// The whole page is black & white: `.landing-mono` (app/landing-mono.css)
// re-colors every accent, and LandingBackground paints the moving backdrop
// behind the sections.

import LandingBackground from "./LandingBackground";
import LandingMascot from "./LandingMascot";
import Hero from "./Hero";
import TrustSection from "./TrustSection";
import Features from "./Features";
import ProductShowcase from "./ProductShowcase";
import HowItWorks from "./HowItWorks";
import MultiTenantSection from "./MultiTenantSection";
import CustomizationSection from "./CustomizationSection";
import Pricing from "./Pricing";
import FAQ from "./FAQ";
import FinalCTA from "./FinalCTA";

export default function LandingPage() {
  return (
    <div className="landing-mono relative">
      <LandingBackground />
      <LandingMascot />
      <main className="relative z-10">
        <Hero />
        <TrustSection />
        <Features />
        <ProductShowcase />
        <HowItWorks />
        <MultiTenantSection />
        <CustomizationSection />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
    </div>
  );
}
