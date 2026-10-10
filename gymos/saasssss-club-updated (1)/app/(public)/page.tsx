"use client";

import { useClubSettings } from "@/context/ClubSettingsContext";
import ThemedHome from "@/components/themes/ThemedHome";
import LandingPage from "@/components/landing/LandingPage";

export default function HomePage() {
  const { hasTenant, loading } = useClubSettings();

  // Wait for the tenant resolution before deciding which UI to show.
  // Without this guard, hasTenant defaults to `true` and the gym page
  // flashes briefly before switching to the SaaS landing on apex host.
  if (loading) return null;

  if (!hasTenant) {
    return <LandingPage />;
  }

  return <ThemedHome />;
}