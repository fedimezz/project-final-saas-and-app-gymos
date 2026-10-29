// GET /api/app-download — public. What the "Download the app" buttons in onboarding and the club
// owner's getting-started page may offer RIGHT NOW. It is a thin view over lib/app-release.ts:
// an APK link is only ever returned for a complete, attested release (https URL, version, SHA-256,
// signed flag) — never a placeholder. The download page URL is always built from the platform's own
// domain (APP_URL), so it is correct even when called from a club subdomain or a custom domain.
import { NextResponse } from "next/server";
import { getAppRelease, getPlayStoreUrl } from "@/lib/app-release";

export const dynamic = "force-dynamic";

function platformOrigin(): string {
  const raw = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
}

export async function GET() {
  const release = getAppRelease();
  const origin = platformOrigin();
  return NextResponse.json(
    {
      downloadPageUrl: `${origin}/download`,
      apk: release.available
        ? { url: release.release.url, version: release.release.version, sha256: release.release.sha256 }
        : null,
      playStoreUrl: getPlayStoreUrl(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
