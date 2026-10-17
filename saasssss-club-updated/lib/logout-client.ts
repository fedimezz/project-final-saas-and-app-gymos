// lib/logout-client.ts
//
// The browser side of "log out for real". Kept free of React and of globals
// (everything is injected) so the exact sequence is unit-tested:
//   1. wipe every client-side copy of the user / club state,
//   2. AWAIT the server expiring the httpOnly cookie (retry once, verify),
//   3. hard-navigate so no in-memory tenant state survives.
// The old implementation fired the request and navigated immediately; the
// browser cancelled the request, the cookie survived and the session check
// signed the user straight back in.

/** Preferences that are not account/tenant data and survive a logout. */
export const KEEP_LOCAL_KEYS = new Set(["theme", "lang"]);
const TENANT_KEY_PREFIXES = ["gymos:", "club:", "tenant:"];
const AUTH_KEYS = ["token", "role", "user", "userName"];

export interface StorageLike {
  removeItem(key: string): void;
  clear?(): void;
  /** Own enumerable keys, e.g. Object.keys(localStorage). */
  keys(): string[];
}

/** Only same-origin absolute paths are accepted as a post-logout destination. */
export function safeInternalPath(path: unknown, fallback: string): string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
    ? path
    : fallback;
}

export function clearAuthMirror(local: StorageLike): void {
  for (const k of AUTH_KEYS) {
    try { local.removeItem(k); } catch { /* storage unavailable */ }
  }
}

export function clearClientState(local: StorageLike, session: StorageLike): void {
  clearAuthMirror(local);
  try {
    for (const key of local.keys()) {
      if (KEEP_LOCAL_KEYS.has(key)) continue;
      if (TENANT_KEY_PREFIXES.some((p) => key.startsWith(p))) local.removeItem(key);
    }
  } catch { /* storage unavailable */ }
  try { session.clear?.(); } catch { /* storage unavailable */ }
}

export interface LogoutDeps {
  /** POSTs /api/auth/logout; resolves null on network failure / timeout. */
  postLogout: () => Promise<{ ok: boolean; json: () => Promise<unknown> } | null>;
  /** true while GET /api/auth/session still answers with a user. */
  sessionStillActive: () => Promise<boolean>;
  local: StorageLike;
  session: StorageLike;
  /** Called BEFORE the network round trip so the UI empties at once. */
  onCleared: () => void;
  navigate: (path: string) => void;
}

export async function performLogout(
  deps: LogoutDeps,
  opts: { previousRole?: string | null; redirectTo?: string } = {}
): Promise<string> {
  clearClientState(deps.local, deps.session);
  deps.onCleared();

  let destination = opts.previousRole?.toUpperCase() === "SUPER_ADMIN" ? "/platform/login" : "/";
  let res = await deps.postLogout();
  if (!res || !res.ok) res = await deps.postLogout(); // one retry
  if (res?.ok) {
    const body = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
    destination = safeInternalPath(body?.redirectTo, destination);
    if (await deps.sessionStillActive()) await deps.postLogout(); // a cookie variant was missed
  }

  clearClientState(deps.local, deps.session); // anything re-written while we waited
  const target = safeInternalPath(opts.redirectTo, destination);
  deps.navigate(target);
  return target;
}
