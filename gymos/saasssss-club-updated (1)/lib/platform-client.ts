// lib/platform-client.ts — small browser-side helpers for the /platform UI.
// (No server imports: safe to use from "use client" components.)

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; field?: string };
}

/** fetch + JSON with uniform error handling: never throws, always returns {ok,status,data}. */
export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  options: { method?: string; json?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.json !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult<T>["data"];
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Erreur réseau — vérifiez votre connexion" } as ApiResult<T>["data"] };
  }
}

/** Public origin of a club: https://{slug}.{platform-host} (keeps the port on localhost). */
export function clubOrigin(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  try {
    const url = new URL(base);
    url.hostname = `${slug}.${url.hostname.replace(/^www\./, "")}`;
    return url.origin;
  } catch {
    return "";
  }
}

/** Host part shown next to the slug input, e.g. ".gymos.tn". */
export function clubHostSuffix(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  try {
    const url = new URL(base);
    return `.${url.host.replace(/^www\./, "")}`;
  } catch {
    return "";
  }
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Whole days from now until `value` (negative when past). null when unset. */
export function daysUntil(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function formatPrice(amount: number, currency: string): string {
  return amount === 0 ? "Gratuit" : `${amount} ${currency}/mois`;
}

/** 14-char password with lower, upper, digit and symbol — passes the server password policy. */
export function generatePassword(length = 14): string {
  const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKMNPQRSTUVWXYZ", "23456789", "!@#$%*?-_"];
  const all = sets.join("");
  const rand = (max: number) => {
    const buf = new Uint32Array(1);
    // rejection sampling → no modulo bias
    const limit = Math.floor(0x100000000 / max) * max;
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  };
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}