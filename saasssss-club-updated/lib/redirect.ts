// lib/redirect.ts
//
// Same-origin redirect validation. `startsWith("/")` is NOT enough:
//   //evil.com      → protocol-relative URL, browsers go to evil.com
//   /\evil.com      → some browsers normalise "\" to "/", same result
//   /%2F%2Fevil.com, control characters, etc.
// The check below resolves the candidate against the real origin and requires
// that it stays on that origin.

export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string,
  origin = "http://localhost"
): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;

  try {
    const resolved = new URL(candidate, origin);
    if (resolved.origin !== new URL(origin).origin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
