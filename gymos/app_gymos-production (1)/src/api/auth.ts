import { apiGet, apiPatch, apiPost, fetchWithTimeout, ApiError } from "@/api/client";
import { DEV_CLUB_API_BASE_URL, PLATFORM_API_BASE_URL, isAllowedUrl, normalizeBaseUrl } from "@/config";
import type {
  ClubSearchResult,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  ResendCodeResponse,
  SessionUser,
  VerifyEmailResponse,
} from "@/api/types";

// Club search hits the platform's own apex (see PLATFORM_API_BASE_URL) — at
// this point the app doesn't yet know which club's host to use, since that's
// exactly what this call resolves. Every other function in this file runs
// AFTER a club is selected and apiBaseUrl is set (src/api/client.ts).
export async function searchClubs(query: string): Promise<{ clubs: ClubSearchResult[] }> {
  const res = await fetchWithTimeout(`${PLATFORM_API_BASE_URL}/api/clubs/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" },
  });
  const data = (await res.json().catch(() => null)) as { clubs?: unknown; error?: string } | null;
  if (!res.ok) {
    throw new ApiError(
      res.status === 429 ? "Trop de recherches. Patientez un instant." : (data?.error ?? "Recherche impossible."),
      res.status,
      null
    );
  }

  const raw: ClubSearchResult[] = (Array.isArray(data?.clubs) ? data.clubs : []).filter(
    (c): c is ClubSearchResult =>
      !!c && typeof c.slug === "string" && typeof c.name === "string" && typeof c.apiBaseUrl === "string"
  );

  const clubs: ClubSearchResult[] = raw
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null,
      // local-backend testing only, see src/config
      apiBaseUrl: normalizeBaseUrl(DEV_CLUB_API_BASE_URL ?? c.apiBaseUrl),
    }))
    // A production build never talks to (or sends credentials to) a non-HTTPS host.
    .filter((c) => isAllowedUrl(c.apiBaseUrl));

  // Results existed but every one was rejected: say so instead of "Aucune salle trouvée".
  if (raw.length > 0 && clubs.length === 0) {
    throw new ApiError("L'adresse de cette salle n'est pas sécurisée (HTTPS requis).", 0, null);
  }

  return { clubs };
}

export function login(email: string, password: string, rememberMe: boolean): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/auth/login", { email, password, rememberMe });
}

export function fetchSession(): Promise<{ user: SessionUser | null }> {
  return apiGet<{ user: SessionUser | null }>("/api/auth/session");
}

export function logout(): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/api/auth/logout");
}

/** Creates a MEMBER account in the selected club (club is resolved server-side from the host). */
export function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return apiPost<RegisterResponse>("/api/auth/register", payload);
}

export function verifyEmail(email: string, code: string): Promise<VerifyEmailResponse> {
  return apiPost<VerifyEmailResponse>("/api/auth/verify", { email, code });
}

export function resendVerificationCode(email: string): Promise<ResendCodeResponse> {
  return apiPost<ResendCodeResponse>("/api/auth/resend-code", { email });
}

/** Always answers with the same generic message (the server never reveals whether the email exists). */
export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>("/api/auth/reset-password", { email });
}

export function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ message: string }> {
  return apiPatch<{ message: string }>("/api/auth/reset-password", { email, code, newPassword });
}
