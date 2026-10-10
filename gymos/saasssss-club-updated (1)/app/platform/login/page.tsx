// app/platform/login/page.tsx
// Login OWNER/ADMIN uniquement — domaine apex (localhost:3000 en dev).
// Les membres d'un club utilisent /user/login sur leur sous-domaine.
"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, Zap, ArrowRight, CheckCircle2, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function ownerDestination(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
  const target = new URL("/admin", baseUrl);
  const hostname = target.hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    target.hostname = `${slug}.localhost`;
  } else {
    target.hostname = `${slug}.${hostname.replace(/^www\./, "")}`;
  }
  return target.toString();
}

function PlatformLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoggedIn, userRole, user, isLoading } = useAuth();

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const justCreated = searchParams.get("created") === "1";
  const expired     = searchParams.get("expired") === "1";

  // Redirect already-authenticated owners/admins to their club dashboard.
  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn || !userRole) return;
    const role = userRole.toUpperCase();
    if (role === "SUPER_ADMIN") { router.replace("/platform"); return; }
    if (role === "ADMIN" || role === "OWNER") {
      const club = user?.club as { slug?: string } | null | undefined;
      window.location.href = club?.slug ? ownerDestination(club.slug) : "/admin";
      return;
    }
    // A member somehow landed here — send them back to their club.
    router.replace("/dashboard");
  }, [isLoading, isLoggedIn, userRole, user, router]);

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
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password, rememberMe, portal: "owner" }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.requiresVerification) {
          window.location.href = `/user/verify?email=${encodeURIComponent(data.email || email)}`;
          return;
        }
        setError(data.error || "Identifiants incorrects.");
        setLoading(false);
        return;
      }

      login(data.user.role, data.user);

      const role = String(data.user.role).toUpperCase();
      if (role === "SUPER_ADMIN") { window.location.href = "/platform"; return; }

      const club = data.user.club as { slug?: string } | null | undefined;
      // bridgeUrl (dev only) hands the session to {slug}.localhost, where the
      // apex cookie isn't visible. In production the shared cookie is enough.
      window.location.href =
        (data.bridgeUrl as string | undefined) ?? (club?.slug ? ownerDestination(club.slug) : "/admin");
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex bg-background">

        {/* ── Left panel — branding ───────────────────────────────────────── */}
        <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 bg-[var(--primary)] text-white">
          <div className="flex items-center gap-2">
            <Zap size={22} />
            <span className="font-bold text-lg tracking-tight">Le Club de Gammarth</span>
          </div>

          <div>
            <p className="text-5xl font-black leading-tight mb-6">
              Gérez votre club.<br />
              <span className="opacity-60">Simplement.</span>
            </p>
            <ul className="space-y-3 text-sm opacity-80">
              {[
                "Tableau de bord en temps réel",
                "Gestion des membres & abonnements",
                "Planning & réservations automatisés",
                "Rapports et analytiques avancés",
              ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="shrink-0" />
                    {f}
                  </li>
              ))}
            </ul>
          </div>

          {/* Divider with member hint */}
          <div className="border-t border-white/20 pt-6">
            <div className="flex items-start gap-3 text-sm opacity-70">
              <Users size={16} className="shrink-0 mt-0.5" />
              <p>
                Vous êtes <strong>membre</strong> d&apos;un club ?
                Connectez-vous depuis l&apos;adresse de votre club
                (ex.&nbsp;<code className="font-mono opacity-90">monclub.leclub.com</code>).
              </p>
            </div>
          </div>
        </div>

        {/* ── Right panel — form ─────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm">

            {/* Mobile logo */}
            <div className="flex items-center gap-2 mb-8 lg:hidden">
              <Zap size={20} className="text-[var(--primary)]" />
              <span className="font-bold text-primary">Le Club de Gammarth</span>
            </div>

            <h1 className="text-2xl font-bold text-primary mb-1">Espace propriétaire</h1>
            <p className="text-sm text-muted mb-8">Connectez-vous pour accéder à votre tableau de bord</p>

            {/* Banners */}
            {justCreated && (
                <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-xl mb-5 text-sm">
                  <CheckCircle2 size={16} />
                  Votre club est prêt — connectez-vous pour l&apos;ouvrir.
                </div>
            )}
            {expired && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-xl mb-5 text-sm">
                  Session expirée. Reconnectez-vous.
                </div>
            )}
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
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="vous@monclub.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 bg-card border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all"
                  />
                  <button
                      type="button"
                      onClick={() => setShowPw((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
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
                      className="h-4 w-4 rounded border-border text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  <span className="text-muted">Se souvenir de moi</span>
                </label>
                <Link href="/user/forgot-password?portal=platform" className="text-[var(--primary)] hover:underline font-medium">
                  Mot de passe oublié ?
                </Link>
              </div>

              {/* Submit */}
              <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--primary-dark)] disabled:opacity-60 transition-all active:scale-95"
              >
                {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                    <>Se connecter <ArrowRight size={15} /></>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-muted mt-6">
              Pas encore de club ?{" "}
              <Link href="/onboarding" className="text-[var(--primary)] hover:underline font-semibold">
                Créer mon gym gratuitement
              </Link>
            </p>

            {/* Mobile member hint */}
            <div className="mt-6 p-3 bg-card border border-border rounded-xl text-xs text-muted flex items-start gap-2 lg:hidden">
              <Users size={14} className="shrink-0 mt-0.5" />
              <p>
                Vous êtes <strong>membre</strong> d&apos;un club ? Connectez-vous depuis l&apos;adresse de votre club, pas ici.
              </p>
            </div>
          </div>
        </div>
      </div>
  );
}

export default function PlatformLoginPage() {
  return (
      <Suspense fallback={null}>
        <PlatformLoginForm />
      </Suspense>
  );
}