import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ClubBrand } from "@/lib/clubBrand";

// The selected club's identity (name, logo, theme, 3D hero). Written by
// ThemeSync (cached per club, refreshed from the website's public settings),
// read by the screens that show the club's brand. `null` = no club selected →
// the screens show the ClubX brand instead.
interface BrandContextValue {
  brand: ClubBrand | null;
  setBrand: (brand: ClubBrand | null) => void;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<ClubBrand | null>(null);
  const value = useMemo(() => ({ brand, setBrand }), [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within a BrandProvider");
  return ctx;
}
