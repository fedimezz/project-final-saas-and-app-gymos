// lib/plan-feature-guard.ts — server-side "is this feature in the club's plan?" guard.
// The UI also shows a lock, but THIS is what actually enforces it: every route that performs a
// plan-gated action calls it with the club id taken from the authenticated session (never from the
// request body) and returns the 402 it produces.
import { NextResponse } from "next/server";
import { checkFeature } from "@/lib/plan-limits";

export type GatedFeature = "customHeroModel" | "customDomain" | "advancedAnalytics" | "revenueAnalytics" | "apiAccess" | "whiteLabel";

export const PLAN_UPGRADE_REQUIRED = "PLAN_UPGRADE_REQUIRED";

export async function denyIfFeatureLocked(clubId: string, feature: GatedFeature): Promise<NextResponse | null> {
  const check = await checkFeature(clubId, feature);
  if (check.ok) return null;
  return NextResponse.json(
    { error: check.reason, code: PLAN_UPGRADE_REQUIRED, feature, upgrade: true, upgradePath: "/admin/billing" },
    { status: 402 }
  );
}

export async function isFeatureAllowed(clubId: string, feature: GatedFeature): Promise<boolean> {
  return (await checkFeature(clubId, feature)).ok;
}
