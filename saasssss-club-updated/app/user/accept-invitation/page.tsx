// app/user/accept-invitation/page.tsx
// Landing page of the emailed invitation link (created by an owner/admin).
// Shows who invited the person and to which club, lets them choose a password,
// then signs them in (the API sets the session cookie).
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, MailCheck } from "lucide-react";
import { useClubSettings } from "@/context/ClubSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { postLoginPath } from "@/lib/post-login-path";

interface Invitation {
  email: string;
  name: string;
  role: string;
  clubName: string;
  invitedByName: string | null;
  expiresAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "propriétaire",
  ADMIN: "administrateur",
  COACH: "coach",
  MEMBER: "membre",
};

function authApiUrl(path: string): string {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return path;
  const parts = window.location.hostname.split(".");
  return parts.length > 1 && parts[0] !== "www" && parts[0] !== "localhost"
    ? `${path}${path.includes("?") ? "&" : "?"}club=${encodeURIComponent(parts[0])}`
    : path;
}

// Mirrors passwordSchema (lib/validation.ts) for instant feedback.
function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[a-z]/.test(pw)) return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[A-Z]/.test(pw)) return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/\d/.test(pw)) return "Le mot de passe doit contenir au moins un chiffre.";
  return null;
}

function AcceptInvitationForm() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const { primaryColor: clubPrimaryColor } = useClubSettings();
  const { login } = useAuth();
  const primaryColor = clubPrimaryColor || "#6366f1";

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!email || !token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const qs = `email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
        const res = await fetch(authApiUrl(`/api/auth/accept-invitation?${qs}`), { credentials: "include" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.invitation) {
          setInvitation(data.invitation);
          setState("ready");
        } else {
          setError(data.error || "");
          setState("invalid");
        }
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirmPassword) return setError("Les mots de passe ne correspondent pas.");

    setSubmitting(true);
    try {
      const res = await fetch(authApiUrl("/api/auth/accept-invitation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Impossible d'activer le compte.");
        setSubmitting(false);
        return;
      }
      const role = String(data.user?.role ?? "").toUpperCase();
      if (!role) {
        // Defensive: an activation response without a user must not leave the
        // page spinning — send the person to the normal sign-in instead.
        setState("done");
        window.setTimeout(() => window.location.assign("/user/login"), 1200);
        return;
      }
      // The API already set the httpOnly session cookie. Persist the client
      // mirror NOW (replacing any stale identity from this browser) so the
      // destination layout sees the right role on first render and never
      // bounces between /admin, /dashboard and /user/login.
      login(role, data.user);
      setState("done");
      window.setTimeout(() => window.location.assign(postLoginPath(role)), 900);
    } catch {
      setError("Erreur de connexion au serveur.");
      setSubmitting(false);
    }
  };

  const clubName = invitation?.clubName ?? "votre club";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-48 -right-48 w-96 h-96 rounded-full blur-3xl opacity-20" style={{ backgroundColor: primaryColor }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          {state === "loading" && (
            <div className="flex justify-center py-10" role="status" aria-label="Chargement">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{
                borderTopColor: "transparent",
                borderRightColor: primaryColor,
                borderBottomColor: primaryColor,
                borderLeftColor: primaryColor,
              }} />
            </div>
          )}

          {state === "invalid" && (
            <div className="text-center space-y-4 py-4">
              <h1 className="text-xl font-bold text-primary">Lien d&apos;invitation invalide</h1>
              <p className="text-sm text-muted">
                Ce lien a expiré, a déjà été utilisé ou est incorrect. Demandez à votre club de vous renvoyer une invitation.
              </p>
              <Link href="/user/login" className="inline-block text-sm font-semibold hover:underline" style={{ color: primaryColor }}>
                Aller à la connexion
              </Link>
            </div>
          )}

          {state === "done" && (
            <div className="text-center space-y-3 py-6">
              <MailCheck className="h-12 w-12 mx-auto text-green-500" aria-hidden="true" />
              <h1 className="text-xl font-bold text-primary">Compte activé</h1>
              <p className="text-sm text-muted">Connexion en cours…</p>
            </div>
          )}

          {state === "ready" && invitation && (
            <>
              <div className="text-center mb-6">
                <div
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white text-2xl font-black shadow-lg"
                  style={{ backgroundColor: primaryColor }}
                >
                  {clubName.charAt(0).toUpperCase()}
                </div>
                <h1 className="text-xl font-bold text-primary">Bienvenue chez {clubName}</h1>
                <p className="text-sm text-muted mt-1.5">
                  {invitation.invitedByName ? (
                    <>
                      <strong className="text-primary">{invitation.invitedByName}</strong> vous a invité
                    </>
                  ) : (
                    "Vous avez été invité"
                  )}{" "}
                  en tant que {ROLE_LABELS[invitation.role] ?? "utilisateur"}. Choisissez votre mot de passe pour activer votre compte.
                </p>
                <p className="text-xs text-muted mt-2">{invitation.email}</p>
              </div>

              {error && (
                <div role="alert" className="p-3 bg-red-500/10 text-red-600 rounded-xl mb-5 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="inv-pw" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="inv-pw"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8 car. min., 1 majuscule, 1 chiffre"
                      className="w-full pl-9 pr-10 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((p) => !p)}
                      aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="inv-pw2" className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      id="inv-pw2"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-4 py-2.5 bg-background border border-border rounded-xl text-primary placeholder:text-muted text-sm focus:outline-none focus:ring-2 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    "Activer mon compte"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
