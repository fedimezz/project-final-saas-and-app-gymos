import { MOBILE_CLIENT_HEADER, REQUEST_TIMEOUT_MS } from "@/config";
import type { ApiErrorBody } from "@/api/types";

let apiBaseUrl: string | null = null;
let clubSlug: string | null = null; // dev-only, see setClubSlug below
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setApiBaseUrl(url: string | null): void {
  apiBaseUrl = url;
}
export function getApiBaseUrl(): string | null {
  return apiBaseUrl;
}
// Dev-only. Real per-club subdomains don't exist over a raw LAN IP — every
// request stays on the platform apex in dev, and this header tells the
// backend which club (the x-club-slug bypass resolveTenantFromRequest()
// already reads). Never sent in production builds.
export function setClubSlug(slug: string | null): void {
  clubSlug = slug;
}
export function setAuthToken(token: string | null): void {
  authToken = token;
}
/** Called when an AUTHENTICATED request is answered 401 (expired / revoked session). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number, // 0 = no response (offline / timeout)
    public body: ApiErrorBody | null
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

const NETWORK_MESSAGE = "Impossible de joindre le serveur. Vérifiez votre connexion internet.";
const TIMEOUT_MESSAGE = "Le serveur met trop de temps à répondre. Réessayez.";

/** fetch with a hard timeout; network failures become ApiError(status 0). */
export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new ApiError(aborted ? TIMEOUT_MESSAGE : NETWORK_MESSAGE, 0, null);
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("apiFetch called before a club was selected");
  }

  // The token is only ever attached to the selected club's own host.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...MOBILE_CLIENT_HEADER,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(__DEV__ && clubSlug ? { "x-club-slug": clubSlug } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  const hadToken = authToken !== null;
  const res = await fetchWithTimeout(`${apiBaseUrl}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;

  if (!res.ok) {
    // 401 on an authenticated call = the session is gone. Login/register/etc.
    // run without a token, so bad credentials never trigger this.
    if (res.status === 401 && hadToken && authToken !== null) onUnauthorized?.();
    throw new ApiError(body?.error ?? `Erreur serveur (${res.status})`, res.status, body);
  }
  return body as T;
}

export const apiGet = <T>(path: string) => apiFetch<T>(path, { method: "GET" });
export const apiPost = <T>(path: string, data?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined });
export const apiPut = <T>(path: string, data?: unknown) =>
  apiFetch<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined });
export const apiPatch = <T>(path: string, data?: unknown) =>
  apiFetch<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined });
export const apiDelete = <T>(path: string, data?: unknown) =>
  apiFetch<T>(path, { method: "DELETE", body: data !== undefined ? JSON.stringify(data) : undefined });
