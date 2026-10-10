import type { MetadataRoute } from "next";

// Every tenant subdomain AND the apex share this file (Next has one route
// per file, not per host) — resolving per-host content here would need the
// request's Host header, which generateMetadata/robots don't receive
// (this runs as a static route by default). Kept intentionally permissive
// and generic; /admin, /dashboard and /platform are behind auth regardless,
// so keeping them out of the crawl budget is a courtesy, not a security
// boundary.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/platform", "/api"] }],
  };
}
