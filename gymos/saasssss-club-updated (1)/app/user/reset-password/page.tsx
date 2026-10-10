"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, CheckCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark } = useTheme();

  const email = searchParams.get("email") ?? "";
  const platformPortal = searchParams.get("portal") === "platform";

  const [code, setCode] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; label: string }[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const linkInvalid = !email;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("Utilisez une minuscule, une majuscule et un chiffre.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Saisissez le code de 6 chiffres reçu par email.");
      return;
    }
    if (accounts.length > 1 && !selectedAccountId) {
      setError("Choisissez le compte à réinitialiser.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          newPassword,
          ...(platformPortal ? { portal: "platform" } : {}),
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.requiresAccountSelection && Array.isArray(data.accounts)) {
          setAccounts(data.accounts);
        }
        setError(data.error || "Code invalide ou expiré");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push(platformPortal ? "/platform/login" : "/user/login"), 2000);
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
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
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 flex items-center justify-center shadow-lg">
              <span className="text-3xl">🔒</span>
            </div>
          </div>
          <h2 className={`text-3xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
            Nouveau mot de passe
          </h2>
          <p className={`text-sm ${isDark ? "text-neutral-400" : "text-gray-600"}`}>
            Choisissez un nouveau mot de passe pour votre compte
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border-l-4 border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {linkInvalid ? (
          <div className="text-center space-y-4">
            <p className={`${isDark ? "text-neutral-300" : "text-gray-700"}`}>
              Adresse email manquante. Demandez un nouveau code.
            </p>
            <Link
              href={`/user/forgot-password${platformPortal ? "?portal=platform" : ""}`}
              className="inline-block w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-2 rounded-lg font-semibold hover:from-green-700 hover:to-green-600 transition-all duration-200"
            >
              Demander un nouveau code
            </Link>
          </div>
        ) : success ? (
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <p className={`${isDark ? "text-neutral-300" : "text-gray-700"}`}>
              Mot de passe réinitialisé. Redirection vers la connexion…
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
                Code reçu par email
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`w-full text-center tracking-[0.5em] text-2xl font-semibold px-3 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-gray-300 text-gray-900"
                }`}
                placeholder="000000"
              />
            </div>
            {accounts.length > 1 && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
                  Compte à réinitialiser
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(event) => {
                    setSelectedAccountId(event.target.value);
                    setError("");
                  }}
                  className={`w-full rounded-lg border px-3 py-2 ${
                    isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-gray-300 text-gray-900"
                  }`}
                >
                  <option value="">Choisissez un compte</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${isDark ? "text-neutral-500" : "text-gray-400"}`} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-gray-300 text-gray-900"
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="h-5 w-5 text-gray-400" /> : <Eye className="h-5 w-5 text-gray-400" />}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${isDark ? "text-neutral-500" : "text-gray-400"}`} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-white border-gray-300 text-gray-900"
                  }`}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white py-2 rounded-lg font-semibold hover:from-green-700 hover:to-green-600 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                "Réinitialiser le mot de passe"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
