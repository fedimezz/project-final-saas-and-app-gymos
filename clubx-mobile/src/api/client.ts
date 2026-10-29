import { MOBILE_CLIENT_HEADER, REQUEST_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "@/config";
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
export function getAuthToken(): string | null {
  return authToken;
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
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

/**
 * A readable French message for a failed response whose body is NOT our JSON error shape.
 * Hosting/proxy layers answer with HTML or plain text (Vercel's 413 "Request Entity Too
 * Large", a 502 from the edge...), and showing "Erreur serveur (413)" tells the member nothing.
 */
export function statusMessage(status: number): string {
  if (status === 401) return "Votre session a expiré. Reconnectez-vous.";
  if (status === 403) return "Action non autorisée.";
  if (status === 408) return TIMEOUT_MESSAGE;
  if (status === 413) return "Le fichier est trop volumineux. Choisissez une photo plus légère.";
  if (status === 429) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (status >= 500) return "Le serveur rencontre un problème. Réessayez dans un instant.";
  return `Erreur serveur (${status})`;
}

/**
 * multipart/form-data POST (profile photo). Differs from apiFetch on purpose:
 *  - NO Content-Type header: fetch must generate `multipart/form-data; boundary=...` itself,
 *    a hand-written one breaks the boundary on Android;
 *  - a long timeout (UPLOAD_TIMEOUT_MS) instead of the 20 s used for JSON calls;
 *  - non-JSON error bodies (proxy / platform limits) become a readable message by status.
 * The token still only goes to the selected club's own host, and no clubId is ever sent: the
 * server derives the club from the host and the authenticated account.
 */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("apiUpload called before a club was selected");
  }
  const headers: Record<string, string> = {
    ...MOBILE_CLIENT_HEADER,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(__DEV__ && clubSlug ? { "x-club-slug": clubSlug } : {}),
  };
  const hadToken = authToken !== null;
  const res = await fetchWithTimeout(`${apiBaseUrl}${path}`, { method: "POST", headers, body: form }, UPLOAD_TIMEOUT_MS);
  const body = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;

  if (!res.ok) {
    if (res.status === 401 && hadToken && authToken !== null) onUnauthorized?.();
    throw new ApiError(typeof body?.error === "string" && body.error ? body.error : statusMessage(res.status), res.status, body);
  }
  return body as T;
}

/**
 * Public binary download (e.g. the club's custom 3D model) from the selected
 * club's own host. Deliberately sends NO Authorization header: the file is
 * public, so the session token never goes along with it. Refuses anything
 * bigger than `maxBytes` before and after downloading.
 */
export async function fetchPublicBinary(path: string, maxBytes: number): Promise<ArrayBuffer> {
  if (!apiBaseUrl) throw new Error("fetchPublicBinary called before a club was selected");
  const headers: Record<string, string> = {
    ...MOBILE_CLIENT_HEADER,
    ...(__DEV__ && clubSlug ? { "x-club-slug": clubSlug } : {}),
  };
  const res = await fetchWithTimeout(`${apiBaseUrl}${path}`, { method: "GET", headers });
  if (!res.ok) throw new ApiError(`Téléchargement impossible (${res.status})`, res.status, null);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("Fichier trop volumineux", 413, null);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new ApiError("Fichier trop volumineux", 413, null);
  return buffer;
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
