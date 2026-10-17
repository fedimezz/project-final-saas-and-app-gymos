"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

// Shown once, right after a brand-new Google sign-up. Google doesn't give
// us a phone number, but the rest of the app (admin member list, staff
// contact, etc.) expects one, so we ask for it here instead of leaving it
// null forever. Skippable — it's optional in the schema.
export default function OnboardingPage() {
  const { isDark } = useTheme();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const goToDashboard = () => {
    window.location.href = "/dashboard";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (phone && !/^[+]?[\d\s\-().]{7,20}$/.test(phone)) {
      setError("Format de téléphone invalide");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/dashboard/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Erreur lors de l'enregistrement");
        setLoading(false);
        return;
      }

      goToDashboard();
    } catch {
      setError("Erreur de connexion au serveur");
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
        className={`max-w-md w-full space-y-6 p-8 rounded-2xl shadow-2xl ${
          isDark
            ? "bg-neutral-900/90 backdrop-blur-sm border border-neutral-800"
            : "bg-white/90 backdrop-blur-sm shadow-2xl"
        }`}
      >
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 flex items-center justify-center shadow-lg">
              <span className="text-2xl">👋</span>
            </div>
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
            Bienvenue !
          </h2>
          <p className={`text-sm ${isDark ? "text-neutral-400" : "text-gray-600"}`}>
            Ajoutez votre numéro de téléphone pour que le club puisse vous contacter.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/50 border-l-4 border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? "text-neutral-300" : "text-gray-700"}`}>
              Téléphone
            </label>
            <div className="relative">
              <Phone className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${isDark ? "text-neutral-500" : "text-gray-400"}`} />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full pl-10 pr-3 py-2 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  isDark
                    ? "bg-neutral-800 border-neutral-700 text-white"
                    : "bg-white border-gray-300 text-gray-900"
                }`}
                placeholder="+216 XX XXX XXX"
                autoFocus
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
              "Continuer"
            )}
          </button>

          <button
            type="button"
            onClick={goToDashboard}
            className={`w-full text-sm py-2 ${isDark ? "text-neutral-400 hover:text-neutral-300" : "text-gray-500 hover:text-gray-700"}`}
          >
            Passer pour l&apos;instant
          </button>
        </form>
      </div>
    </div>
  );
}
