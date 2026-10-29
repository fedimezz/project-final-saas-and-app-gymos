"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { postLoginPath } from "@/lib/post-login-path";
import { ClubLogo } from "@/components/ClubLogo";

function VerifyForm() {
  const searchParams = useSearchParams();
  const { isDark } = useTheme();
  const { name: clubName, logoUrl } = useClubSettings();
  const { login } = useAuth();
  const [email] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loggedIn, setLoggedIn] = useState<string | null>(null); // role, when verify also signed us in
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Code invalide");
        setLoading(false);
        return;
      }

      // The API signs the user in after a correct code; go straight to their
      // space. (loggedIn:false → e.g. inactive account: fall back to "Se connecter".)
      if (data.loggedIn && data.user?.role) {
        setLoggedIn(String(data.user.role).toUpperCase());
        setSuccess(true);
        const role = String(data.user.role).toUpperCase();
        // Replace any stale client mirror with the verified identity first.
        login(role, data.user);
        window.setTimeout(() => {
          window.location.assign(postLoginPath(role));
        }, 1200);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setResending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setCooldown(typeof data.cooldownSeconds === "number" ? data.cooldownSeconds : 60);
      } else {
        // 429 carries the remaining cooldown so the countdown matches the server.
        if (typeof data.retryAfterSeconds === "number") setCooldown(data.retryAfterSeconds);
        setError(data.error || "Impossible de renvoyer le code");
      }
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-neutral-900 via-neutral-950 to-black"
          : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
      }`}
    >
      <div
        className={`max-w-md w-full space-y-8 p-8 rounded-2xl shadow-2xl ${
          isDark
            ? "bg-neutral-900/90 backdrop-blur-sm border border-neutral-800"
            : "bg-white/90 backdrop-blur-sm shadow-2xl"
        }`}
      >
        <div className="flex justify-center -mb-4">
          <ClubLogo logoUrl={logoUrl} clubName={clubName} size="lg" />
        </div>
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 flex items-center justify-center shadow-lg">
              <span className="text-3xl">✉️</span>
            </div>
          </div>
          <h2 className={`text-3xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
            Vérifiez votre email
          </h2>
          <p className={`text-sm ${isDark ? "text-neutral-400" : "text-gray-600"}`}>
            Entrez le code à 6 chiffres envoyé à{" "}
            <span className="font-medium">{email || "votre adresse email"}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border-l-4 border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <p className={`${isDark ? "text-neutral-300" : "text-gray-700"}`}>
              Votre email a été vérifié avec succès.
              {loggedIn && " Connexion en cours…"}
            </p>
            {!loggedIn && (
              <Link
                href="/user/login"
                className="inline-block w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-2 rounded-lg font-semibold hover:from-green-700 hover:to-green-600 transition-all duration-200"
              >
                Se connecter
              </Link>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="verify-code" className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
                Code de vérification
              </label>
              <input
                id="verify-code"
                autoComplete="one-time-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`w-full text-center tracking-[0.5em] text-2xl font-semibold px-3 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-gray-300 text-gray-900"
                }`}
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-2 rounded-lg font-semibold hover:from-green-700 hover:to-green-600 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                "Vérifier"
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="text-sm text-green-600 hover:text-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyForm />
    </Suspense>
  );
}
