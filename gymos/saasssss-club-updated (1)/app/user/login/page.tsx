// app/user/login/page.tsx
// Login MEMBRES uniquement — sous-domaine du club (mygym.localhost:3000 en dev).
// Les owners/admins utilisent /platform/login sur le domaine principal.
"use client";

import { postLoginPath } from "@/lib/post-login-path";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { ClubLogo } from "@/components/ClubLogo";

function authApiUrl(path: string): string {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return path;
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  return parts.length > 1 && parts[0] !== "www" && parts[0] !== "localhost"
    ? `${path}?club=${encodeURIComponent(parts[0])}`
    : path;
}

function MemberLoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoggedIn, userRole, isLoading } = useAuth();
  const { name: clubSettingsName, primaryColor: clubPrimaryColor, logoUrl } = useClubSettings();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const clubName = clubSettingsName || "Votre club";
  const primaryColor = clubPrimaryColor || "#6366f1";

  // Surface OAuth errors
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      const MSGS: Record<string, string> = {
        google_denied:         "Connexion Google annulée.",
        google_not_configured: "Connexion Google non disponible.",
        google_state_mismatch: "Session expirée, réessayez.",
        google_token_failed:   "Erreur Google — réessayez.",
        google_email_unverified: "Email Google non vérifié.",
        google_error:          "Erreur lors de la connexion Google.",
        google_userinfo_failed: "Impossible de lire votre profil Google — réessayez.",
        google_account_linked_elsewhere: "Ce compte Google est déjà lié à un autre club.",
        club_unavailable:      "Ce club n'est plus disponible.",
        account_disabled:      "Compte désactivé. Contactez l'administrateur.",
      };
      setError(MSGS[oauthError] ?? "Une erreur est survenue.");
    }
  }, [searchParams]);

  // Redirect already-authenticated users
  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn || !userRole) return;
    const role = userRole.toUpperCase();
    if (role === "ADMIN" || role === "OWNER") {
      // On a club subdomain → club admin panel. On bare localhost →
      // the member login is the wrong place for an owner; redirect back
      // to the platform root so they can navigate correctly.
      const isClubSubdomain = typeof window !== "undefined" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1" &&
        !window.location.hostname.startsWith("www.");
      router.replace(isClubSubdomain ? "/admin" : "/");
    } else {
      router.replace(postLoginPath(role));
    }
  }, [isLoading, isLoggedIn, userRole, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email.trim() || !password) {
      setError("Veuillez remplir tous les champs.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(authApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresVerification) {
          window.location.href = `/user/verify?email=${encodeURIComponent(data.email || email)}`;
          return;
        }
        setError(data.error || "Email ou mot de passe incorrect.");
        setLoading(false);
        return;
      }

      login(data.user.role, data.user);

      const role = String(data.user.role).toUpperCase();
      if (role === "ADMIN" || role === "OWNER") {
        // Only redirect to /admin when on a club subdomain. On bare localhost
        // (no club context) the member login shouldn't handle owner logins —
        // send them to / so the platform landing is shown.
        const isClubSubdomain =
          window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1" &&
          !window.location.hostname.startsWith("www.");
        window.location.href = isClubSubdomain ? "/admin" : "/";
      } else {
        window.location.href = postLoginPath(role);
      }
    } catch {
      setError("Erreur de connexion au serveur.");
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">

        {/* Ambient background blobs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
              className="absolute -top-48 -right-48 w-96 h-96 rounded-full blur-3xl opacity-20"
              style={{ backgroundColor: primaryColor }}
          />
          <div
              className="absolute -bottom-48 -left-48 w-96 h-96 rounded-full blur-3xl opacity-10"
              style={{ backgroundColor: primaryColor }}
          />
        </div>

        <div className="relative w-full max-w-md">

          {/* Club identity */}
          <div className="text-center mb-8 flex flex-col items-center">
            <ClubLogo logoUrl={logoUrl} clubName={clubName} size="xl" className="mb-4 shadow-lg" />
            <h1 className="text-2xl font-bold text-primary">{clubName}</h1>
            <p className="text-sm text-muted mt-1">Connectez-vous à votre espace membre</p>
          </div>

          {/* Card */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">

            {error && (
                <div className="p-3 bg-red-500/10 text-red-600 rounded-xl mb-5 text-sm">
                  {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="votre@email.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:border-[var(--primary)] transition-all"
                      style={{ "--tw-ring-color": `${primaryColor}40` } as React.CSSProperties}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                  />
                  <button
                      type="button"
                      onClick={() => setShowPw((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  >
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Remember + forgot */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-muted">Se souvenir de moi</span>
                </label>
                <Link href="/user/forgot-password" className="text-muted hover:text-primary font-medium transition-colors">
                  Mot de passe oublié ?
                </Link>
              </div>

              {/* Submit */}
              <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 shadow-sm"
                  style={{ backgroundColor: primaryColor }}
              >
                {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                ) : (
                    "Se connecter"
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Google */}
            <a
                href="/api/auth/google"
                className="w-full flex items-center justify-center gap-3 py-2.5 bg-background border border-border rounded-xl text-sm text-primary font-medium hover:bg-card transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.28 24 12 24Z" />
                <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.26a12 12 0 0 0 0 10.75l4.01-3.11Z" />
                <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.63l4.01 3.11C6.22 6.88 8.87 4.75 12 4.75Z" />
              </svg>
              Continuer avec Google
            </a>

            <p className="text-center text-sm text-muted mt-5">
              Pas encore membre ?{" "}
              <Link href="/user/register" className="font-semibold text-primary hover:underline">
                Créer un compte
              </Link>
            </p>
          </div>
        </div>
      </div>
  );
}

export default function MemberLoginPage() {
  return (
      <Suspense fallback={null}>
        <MemberLoginForm />
      </Suspense>
  );
}