// app/user/register/page.tsx
// Inscription MEMBRES uniquement — sous-domaine du club (mygym.localhost:3000 en dev).
// Pour créer un NOUVEAU club, aller sur localhost:3000/onboarding.
"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, User, Mail, Lock } from "lucide-react";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { ClubLogo } from "@/components/ClubLogo";
import PhoneInput from "@/components/PhoneInput";
import CountrySelect from "@/components/CountrySelect";
import { DEFAULT_COUNTRY } from "@/lib/countries";

// Same rule as passwordSchema on the server (lib/validation.ts), checked here
// so the user gets instant feedback instead of a round-trip.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[a-z]/.test(pw)) return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[A-Z]/.test(pw)) return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/\d/.test(pw)) return "Le mot de passe doit contenir au moins un chiffre.";
  return null;
}

function authApiUrl(path: string): string {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return path;
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  return parts.length > 1 && parts[0] !== "www" && parts[0] !== "localhost"
    ? `${path}?club=${encodeURIComponent(parts[0])}`
    : path;
}

export default function MemberRegisterPage() {
  const { name: clubSettingsName, primaryColor: clubPrimaryColor, logoUrl } = useClubSettings();

  const clubName     = clubSettingsName || "Votre club";
  const primaryColor = clubPrimaryColor || "#6366f1";

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", country: DEFAULT_COUNTRY,
    password: "", confirmPassword: "",
  });
  const [phoneValid, setPhoneValid] = useState(false);
  const [showPw, setShowPw]       = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email || !form.phone || !form.password || !form.confirmPassword) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    if (!phoneValid) {
      setError("Numéro de téléphone invalide.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    const pwProblem = passwordProblem(form.password);
    if (pwProblem) {
      setError(pwProblem);
      return;
    }
    if (!acceptTerms) {
      setError("Veuillez accepter les conditions générales.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(authApiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'inscription.");
        setLoading(false);
        return;
      }

      // No session yet — must verify email first.
      window.location.href = `/user/verify?email=${encodeURIComponent(data.email ?? form.email)}`;
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
          <div className="text-center mb-8">
            <ClubLogo logoUrl={logoUrl} clubName={clubName} size="xl" className="mx-auto mb-4 shadow-lg" />
            <h1 className="text-2xl font-bold text-primary">{clubName}</h1>
            <p className="text-sm text-muted mt-1">Créez votre compte membre</p>
          </div>

          {/* Card */}
          <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">

            {error && (
                <div className="p-3 bg-red-500/10 text-red-600 rounded-xl mb-5 text-sm">
                  {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* First / last name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="reg-first" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Prénom
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                        id="reg-first"
                        type="text"
                        autoComplete="given-name"
                        value={form.firstName}
                        onChange={(e) => patch({ firstName: e.target.value })}
                        placeholder="Prénom"
                        className="w-full pl-9 pr-3 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-last" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Nom
                  </label>
                  <input
                      id="reg-last"
                      type="text"
                      autoComplete="family-name"
                      value={form.lastName}
                      onChange={(e) => patch({ lastName: e.target.value })}
                      placeholder="Nom"
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type="email"
                      value={form.email}
                      onChange={(e) => patch({ email: e.target.value })}
                      placeholder="vous@email.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                  />
                </div>
              </div>

              {/* Country */}
              <div>
                <label htmlFor="reg-country" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Pays
                </label>
                <CountrySelect
                    id="reg-country"
                    value={form.country}
                    onChange={(country) => patch({ country })}
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="reg-phone" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Téléphone
                </label>
                <PhoneInput
                    id="reg-phone"
                    value={form.phone}
                    defaultCountry={form.country}
                    onChange={(phone, meta) => {
                      patch({ phone });
                      setPhoneValid(meta.valid);
                    }}
                />
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
                      value={form.password}
                      onChange={(e) => patch({ password: e.target.value })}
                      placeholder="8 car. min., 1 majuscule, 1 chiffre"
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

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                      type={showPw ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(e) => patch({ confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                  />
                </div>
              </div>

              {/* Terms */}
              <label className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span className="text-muted">
                J&apos;accepte les{" "}
                  <Link href="/terms" className="text-primary hover:underline font-medium">
                  conditions générales
                </Link>
              </span>
              </label>

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
                    "Créer mon compte"
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
              Déjà membre ?{" "}
              <Link href="/user/login" className="font-semibold text-primary hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
  );
}