import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveTenantFromRequest } from "@/lib/tenant";
import { buildTenantOrigin } from "@/lib/tenant-url";

// Static shell only: this app is multi-tenant per-subdomain content
// generated from each club's own pages/settings, which isn't something a
// single host-less sitemap route can enumerate. A per-tenant sitemap would
// need its own route that resolves the tenant from the request Host header.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (host) {
    const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim()
      ?? (host.split(":")[0] === "localhost" || host.endsWith(".localhost") ? "http" : "https");
    const request = new Request(`${protocol}://${host}/`, { headers: requestHeaders });
    const tenant = await resolveTenantFromRequest(request);
    if (tenant) {
      const origin = buildTenantOrigin(tenant, `${protocol}://${host}`);
      const paths = ["/", "/actualites", "/offres", "/gallery"];
      return paths.map((path, index) => ({
        url: new URL(path, origin).toString(),
        lastModified: new Date(),
        changeFrequency: index === 0 ? "weekly" : "monthly",
        priority: index === 0 ? 1 : 0.6,
      }));
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://example.com";
  return [{ url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
