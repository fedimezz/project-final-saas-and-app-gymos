"use client";

import { useEffect, useState } from "react";
import { fetchPublicJson } from "@/lib/public-fetch";

export interface PublicPromotion {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  startDate: string;
  endDate: string | null;
  usesLeft: number | null;
}

/** Offers the current club published (tenant comes from the host, server-side). */
export function usePublicPromotions() {
  const [promotions, setPromotions] = useState<PublicPromotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const json = await fetchPublicJson<{ promotions?: unknown }>("/api/promotions/public").catch(() => null);
        if (!controller.signal.aborted) {
          setPromotions(Array.isArray(json?.promotions) ? json.promotions : []);
        }
      } catch {
        /* public page stays usable without offers */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return { promotions, loading };
}
