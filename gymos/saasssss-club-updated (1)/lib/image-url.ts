// lib/image-url.ts — the ONE place that decides whether a stored image URL is
// safe to render. next/image throws for hosts not listed in next.config.ts
// (a bad logo/photo URL used to be able to crash a whole public page), and
// `javascript:`/`data:` URLs must never reach an <img>/<Image> src.
// KEEP IN SYNC with `images.remotePatterns` in next.config.ts.
export const ALLOWED_IMAGE_HOSTS = ["res.cloudinary.com", "images.unsplash.com"] as const;

/** Returns the URL when it is renderable, otherwise null (callers show a fallback). */
export function safeImageUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const url = input.trim();
  if (!url || url.length > 2000) return null;

  // Same-origin static asset (e.g. "/images/hero.jpg"): single leading slash,
  // no protocol-relative "//", no traversal, no backslashes.
  if (url.startsWith("/")) {
    if (url.startsWith("//") || url.includes("..") || url.includes("\\")) return null;
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (!(ALLOWED_IMAGE_HOSTS as readonly string[]).includes(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Keeps only renderable, de-duplicated URLs, capped at `max`. */
export function safeImageList(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const item of input) {
    const ok = safeImageUrl(item);
    if (ok) seen.add(ok);
    if (seen.size >= max) break;
  }
  return [...seen];
}
