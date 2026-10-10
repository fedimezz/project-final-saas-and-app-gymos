"use client";

import { useState, useEffect } from "react";
import {
  Building2, User, CreditCard, Check, ArrowRight, ArrowLeft,
  Loader2, Eye, EyeOff, Zap, AlertCircle,
} from "lucide-react";
import CountrySelect from "@/components/payments/CountrySelect";
import ThemePicker from "@/components/admin/ThemePicker";
import type { ThemePreset } from "@/lib/website-themes";
import { formatMembershipPrice } from "@/lib/payment-currencies";

// ── Types ────────────────────────────────────────────────────────────────────

interface SaasPlan {
  id: string;
  tier: "STARTER" | "PRO" | "BUSINESS";
  name: string;
  priceMonthly: number;
  currency: string;
  limits: Record<string, unknown>;
}

interface FormData {
  // Step 1 — founder account
  name: string;
  email: string;
  password: string;
  phone: string;
  // Step 2 — club info
  clubName: string;
  slug: string;
  // Step 3 — plan
  planId: string;
  countryCode: string;
  themeId: string;
  primaryColor: string;
  secondaryColor: string;
  heroTitle: string;
  heroSubtitle: string;
  address: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// After /api/onboarding/create-club succeeds, hand the owner off to their
// new club's own subdomain via /api/auth/bridge — see that route for why
// this doesn't just rely on the cookie create-club already set.
//
// FIX: In local development most systems do NOT resolve *.localhost via
// wildcard DNS, so navigating to monclub.localhost:3000 yields a
// "host not found" error in the browser. Instead we stay on localhost and
// pass the club slug as a ?club= query-param, which resolveTenantFromRequest
// already supports in development (lib/tenant.ts → querySlug branch).
// In production the real subdomain is used as before.
function ownerSettingsDestination(slug: string, bridgeToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
  const target = new URL("/api/auth/bridge", baseUrl);
  const hostname = target.hostname;

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    // Dev: keep the same host, resolve the tenant via the ?club= param
    // that lib/tenant.ts accepts in NODE_ENV !== "production".
    target.searchParams.set("club", slug);
  } else {
    // Production: real subdomain routing
    target.hostname = `${slug}.${hostname.replace(/^www\./, "")}`;
  }

  target.searchParams.set("token", bridgeToken);
  // New clubs land in the guided website setup wizard (page content
  // + publish) rather than the raw settings screen — see /admin/website-setup.
  target.searchParams.set("redirect", "/admin/get-started");
  return target.toString();
}

function slugify(s: string): string {
  return s
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
}

function limitLabel(key: string, val: unknown): string {
  if (val === null || val === undefined) return "Illimité";
  if (typeof val === "boolean") return val ? "✓" : "✗";
  const labels: Record<string, string> = {
    maxMembers: "membres",
    maxCoaches: "coachs",
    maxAdmins: "admins",
    maxBookingsPerMonth: "réservations/mois",
  };
  return `${val} ${labels[key] ?? key}`;
}

const DISPLAY_LIMIT_KEYS = ["maxMembers", "maxCoaches", "maxAdmins", "maxBookingsPerMonth", "advancedAnalytics", "customDomain"];

const TIER_COLOR: Record<string, string> = {
  STARTER:  "border-blue-500 bg-blue-500/5",
  PRO:      "border-purple-500 bg-purple-500/5",
  BUSINESS: "border-amber-500 bg-amber-500/5",
};
const TIER_BADGE: Record<string, string> = {
  STARTER:  "bg-blue-500/10 text-blue-600",
  PRO:      "bg-purple-500/10 text-purple-600",
  BUSINESS: "bg-amber-500/10 text-amber-600",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
      <div className="flex items-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < current
                      ? "bg-[var(--primary)] text-white"
                      : i === current
                          ? "border-2 border-[var(--primary)] text-[var(--primary)]"
                          : "border-2 border-border text-muted"
              }`}>
                {i < current ? <Check size={14} /> : i + 1}
              </div>
              {i < total - 1 && (
                  <div className={`w-8 h-0.5 ${i < current ? "bg-[var(--primary)]" : "bg-border"}`} />
              )}
            </div>
        ))}
      </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-1">{msg}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">{children}</label>;
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
      <input
          {...props}
          className={`w-full px-4 py-2.5 bg-card border border-border rounded-xl text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] transition-all text-sm ${props.className ?? ""}`}
      />
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Step1({
  data,
  onChange,
  errors,
  emailCode,
  onEmailCodeChange,
  emailCodeSent,
  emailVerified,
  emailVerificationBusy,
  emailVerificationMessage,
  emailVerificationError,
  onSendEmailCode,
  onVerifyEmailCode,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  errors: Record<string, string>;
  emailCode: string;
  onEmailCodeChange: (value: string) => void;
  emailCodeSent: boolean;
  emailVerified: boolean;
  emailVerificationBusy: boolean;
  emailVerificationMessage: string | null;
  emailVerificationError: boolean;
  onSendEmailCode: () => void;
  onVerifyEmailCode: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  return (
      <div className="space-y-4">
        <div>
          <Label>Prénom et nom *</Label>
          <Input
              placeholder="Votre nom complet"
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
          />
          <FieldError msg={errors.name} />
        </div>
        <div>
          <Label>Email *</Label>
          <Input
              type="email"
              placeholder="vous@exemple.com"
              value={data.email}
              disabled={emailVerificationBusy}
              onChange={(e) => onChange({ email: e.target.value })}
          />
          <FieldError msg={errors.email} />
          {emailVerified ? (
            <div className="mt-2 flex items-center gap-3">
              <p className="text-xs font-semibold text-emerald-600">Adresse email vérifiée.</p>
              <button
                type="button"
                onClick={onSendEmailCode}
                disabled={emailVerificationBusy}
                className="text-xs font-semibold text-[var(--primary)] underline disabled:opacity-50"
              >
                Renvoyer un code
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onSendEmailCode}
                disabled={emailVerificationBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)}
                className="mt-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-primary transition hover:border-[var(--primary)]/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {emailVerificationBusy ? "Envoi…" : emailCodeSent ? "Renvoyer le code" : "Envoyer un code de vérification"}
              </button>
              {emailCodeSent && (
                <div className="mt-3 flex gap-2">
                  <Input
                    value={emailCode}
                    onChange={(e) => onEmailCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="Code à 6 chiffres"
                    className="min-w-0"
                  />
                  <button
                    type="button"
                    onClick={onVerifyEmailCode}
                    disabled={emailVerificationBusy || emailCode.length !== 6}
                    className="shrink-0 rounded-xl bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Vérifier
                  </button>
                </div>
              )}
            </>
          )}
          {emailVerificationMessage && (
            <p className={`mt-2 text-xs ${emailVerificationError ? "text-red-500" : "text-muted"}`}>
              {emailVerificationMessage}
            </p>
          )}
        </div>
        <div>
          <Label>Mot de passe *</Label>
          <div className="relative">
            <Input
                type={showPw ? "text" : "password"}
                placeholder="8 caractères minimum"
                value={data.password}
                onChange={(e) => onChange({ password: e.target.value })}
                className="pr-10"
            />
            <button
                type="button"
                onClick={() => setShowPw((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <FieldError msg={errors.password} />
        </div>
        <div>
          <Label>Téléphone (optionnel)</Label>
          <Input
              type="tel"
              placeholder="+216 XX XXX XXX"
              value={data.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
      </div>
  );
}

function Step2({ data, onChange, errors, slugChecking, slugAvailable }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  errors: Record<string, string>;
  slugChecking: boolean;
  slugAvailable: boolean | null;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const host = appUrl.replace(/^https?:\/\//, "");

  return (
      <div className="space-y-4">
        <div>
          <Label>Nom du club *</Label>
          <Input
              placeholder="Mon Club Fitness"
              value={data.clubName}
              onChange={(e) => {
                const clubName = e.target.value;
                onChange({ clubName, slug: slugify(clubName) });
              }}
          />
          <FieldError msg={errors.clubName} />
        </div>
        <div>
          <Label>Sous-domaine *</Label>
          <div className="flex items-center gap-0">
            <Input
                placeholder="mon-club"
                value={data.slug}
                onChange={(e) => onChange({ slug: slugify(e.target.value) })}
                className="rounded-r-none"
            />
            <span className="px-3 py-2.5 bg-muted/20 border border-l-0 border-border rounded-r-xl text-sm text-muted whitespace-nowrap">.{host}</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Votre site sera accessible à : <code className="font-mono bg-muted/10 px-1 rounded">{data.slug || "mon-club"}.{host}</code>
          </p>
          {data.slug.length >= 3 && (
              <p className={`text-xs mt-1 ${slugChecking ? "text-muted" : slugAvailable ? "text-emerald-600" : "text-red-500"}`}>
                {slugChecking ? "Vérification du sous-domaine…" : slugAvailable ? "Sous-domaine disponible" : "Sous-domaine déjà utilisé"}
              </p>
          )}
          <FieldError msg={errors.slug} />
        </div>
        <div>
          <Label>Adresse (optionnel)</Label>
          <Input placeholder="Adresse de votre club" value={data.address} onChange={(e) => onChange({ address: e.target.value })} />
        </div>
      </div>
  );
}

function Step3Design({ data, onChange }: { data: FormData; onChange: (patch: Partial<FormData>) => void }) {
  const handleThemeSelect = (theme: ThemePreset) => onChange({
    themeId: theme.id,
    primaryColor: theme.primaryColor,
    secondaryColor: theme.secondaryColor,
  });
  return (
      <div className="space-y-4">
        <div>
          <Label>Choisissez le thème de votre site</Label>
          <ThemePicker selectedId={data.themeId} onSelect={handleThemeSelect} clubName={data.clubName} />
        </div>
        <div>
          <Label>Titre de la page d&apos;accueil</Label>
          <Input placeholder="Bienvenue dans votre club" value={data.heroTitle} onChange={(e) => onChange({ heroTitle: e.target.value })} />
        </div>
        <div>
          <Label>Description courte</Label>
          <textarea value={data.heroSubtitle} onChange={(e) => onChange({ heroSubtitle: e.target.value })} placeholder="Une expérience sportive pensée pour vous" className="min-h-24 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-primary outline-none focus:border-[var(--primary)]" />
        </div>
        <div className="rounded-xl border border-border p-4" style={{ borderColor: data.primaryColor }}>
          <p className="text-lg font-bold" style={{ color: data.primaryColor }}>{data.heroTitle || data.clubName || "Votre club"}</p>
          <p className="mt-1 text-sm text-muted">{data.heroSubtitle || "Votre espace sportif, votre identité."}</p>
        </div>
      </div>
  );
}

function Step3({ data, onChange, plans, plansLoading, plansError, errors }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  plans: SaasPlan[];
  plansLoading: boolean;
  plansError: boolean;
  errors: Record<string, string>;
}) {
  return (
      <div className="space-y-4">
        {plansLoading && (
            <div className="flex items-center gap-2 text-muted text-sm">
              <Loader2 size={16} className="animate-spin" /> Chargement des plans…
            </div>
        )}
        {!plansLoading && plansError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-600 rounded-xl text-sm">
              <AlertCircle size={16} /> Impossible de charger les plans. Vérifiez votre connexion et réessayez.
            </div>
        )}
        {!plansLoading && !plansError && plans.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-600 rounded-xl text-sm">
              <AlertCircle size={16} /> Aucun plan n&apos;est disponible pour le moment. Contactez le support.
            </div>
        )}
        <CountrySelect value={data.countryCode} onChange={(countryCode) => onChange({ countryCode })} />
        <FieldError msg={errors.countryCode} />
        {data.countryCode === "TN" && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-700 rounded-xl text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            La création payante nécessite Stripe. Le paiement en ligne n&apos;est pas disponible pour les comptes en Tunisie ; contactez le support.
          </div>
        )}
        {plans.map((plan) => {
          const selected = data.planId === plan.id;
          return (
              <button
                  key={plan.id}
                  type="button"
                  onClick={() => onChange({ planId: plan.id })}
                  disabled={plan.priceMonthly <= 0}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? TIER_COLOR[plan.tier] : "border-border bg-card hover:border-[var(--primary)]/30"
                  }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TIER_BADGE[plan.tier]}`}>
                    {plan.tier}
                  </span>
                      <span className="font-semibold text-primary">{plan.name}</span>
                    </div>
                    <p className="text-xl font-bold text-primary">
                      {plan.priceMonthly <= 0 ? "Plan payant requis" : `${formatMembershipPrice(plan.priceMonthly, plan.currency)}/mois`}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                      selected ? "border-[var(--primary)] bg-[var(--primary)]" : "border-border"
                  }`}>
                    {selected && <Check size={11} className="text-white" />}
                  </div>
                </div>
                <ul className="space-y-1">
                  {DISPLAY_LIMIT_KEYS.map((key) => {
                    const val = plan.limits[key];
                    if (val === undefined) return null;
                    return (
                        <li key={key} className="text-xs text-muted flex items-center gap-2">
                          <span className="text-[var(--primary)]">•</span>
                          {limitLabel(key, val)}
                        </li>
                    );
                  })}
                </ul>
                {plan.priceMonthly > 0 && <p className="text-xs text-muted mt-2">Activation après confirmation du paiement Stripe.</p>}
              </button>
          );
        })}
        <FieldError msg={errors.planId} />
      </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Votre compte",   icon: User },
  { label: "Votre club",     icon: Building2 },
  { label: "Votre design",   icon: Zap },
  { label: "Choisir un plan", icon: CreditCard },
];

export default function OnboardingWizardPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    name: "", email: "", password: "", phone: "",
    clubName: "", slug: "", planId: "", countryCode: "", themeId: "classic",
    primaryColor: "#4f46e5", secondaryColor: "#3b82f6",
    heroTitle: "", heroSubtitle: "", address: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerificationToken, setEmailVerificationToken] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [emailVerificationBusy, setEmailVerificationBusy] = useState(false);
  const [emailVerificationMessage, setEmailVerificationMessage] = useState<string | null>(null);
  const [emailVerificationError, setEmailVerificationError] = useState(false);

  useEffect(() => {
    fetch("/api/saas-plans")
        .then((r) => r.json())
        .then((d) => setPlans(Array.isArray(d.plans) ? d.plans : []))
        .catch(() => setPlansError(true))
        .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/country", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && typeof data.countryCode === "string") {
          setForm((current) => ({ ...current, countryCode: data.countryCode }));
        }
      })
      .catch(() => {
        if (!cancelled) setGlobalError("Impossible de détecter votre pays. Choisissez-le manuellement.");
      });
    return () => { cancelled = true; };
  }, []);

  const patch = (p: Partial<FormData>) => {
    if (p.email !== undefined && p.email.trim().toLowerCase() !== form.email.trim().toLowerCase()) {
      setEmailCode("");
      setEmailCodeSent(false);
      setEmailVerificationToken(null);
      setVerifiedEmail(null);
      setEmailVerificationMessage(null);
      setEmailVerificationError(false);
    }
    setForm((f) => ({ ...f, ...p }));
    // Clear the errors for changed fields
    const cleared: Record<string, string> = { ...errors };
    Object.keys(p).forEach((k) => delete cleared[k]);
    setErrors(cleared);
    if (p.slug !== undefined) setSlugAvailable(null);
  };

  const sendEmailCode = async () => {
    if (emailVerificationBusy) return;
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailVerificationError(true);
      setEmailVerificationMessage("Saisissez une adresse email valide.");
      return;
    }
    setEmailVerificationBusy(true);
    setEmailVerificationMessage(null);
    setEmailVerificationError(false);
    try {
      const response = await fetch("/api/onboarding/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Envoi du code impossible.");
      setEmailCodeSent(true);
      setEmailCode("");
      setEmailVerificationToken(null);
      setVerifiedEmail(null);
      setEmailVerificationMessage(json.message || "Code envoyé. Consultez votre email.");
    } catch (error) {
      setEmailVerificationError(true);
      setEmailVerificationMessage(error instanceof Error ? error.message : "Envoi du code impossible.");
    } finally {
      setEmailVerificationBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    if (emailVerificationBusy || emailCode.length !== 6) return;
    const email = form.email.trim().toLowerCase();
    setEmailVerificationBusy(true);
    setEmailVerificationMessage(null);
    setEmailVerificationError(false);
    try {
      const response = await fetch("/api/onboarding/email-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: emailCode }),
      });
      const json = await response.json();
      if (!response.ok || typeof json.verificationToken !== "string") {
        throw new Error(json.error || "Code invalide ou expiré.");
      }
      setEmailVerificationToken(json.verificationToken);
      setVerifiedEmail(email);
      setEmailVerificationMessage("Votre adresse email est vérifiée.");
    } catch (error) {
      setEmailVerificationError(true);
      setEmailVerificationMessage(error instanceof Error ? error.message : "Vérification impossible.");
    } finally {
      setEmailVerificationBusy(false);
    }
  };

  useEffect(() => {
    if (form.slug.length < 3) return;
    const timer = window.setTimeout(async () => {
      setSlugChecking(true);
      try {
        const response = await fetch(`/api/onboarding/check-slug?slug=${encodeURIComponent(form.slug)}`);
        const json = await response.json();
        setSlugAvailable(response.ok && json.available === true);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [form.slug]);

  const validateStep = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.name.trim() || form.name.trim().length < 2) e.name = "Nom trop court";
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email invalide";
      else if (!emailVerificationToken || verifiedEmail !== form.email.trim().toLowerCase()) {
        e.email = "Vérifiez votre adresse email avant de continuer.";
      }
      if (form.password.length < 8) e.password = "8 caractères minimum";
    }
    if (step === 1) {
      if (!form.clubName.trim() || form.clubName.trim().length < 2) e.clubName = "Nom du club trop court";
      if (!form.slug || form.slug.length < 3) e.slug = "Slug trop court (3 car. min.)";
      if (!/^[a-z0-9-]+$/.test(form.slug)) e.slug = "Lettres minuscules, chiffres et tirets uniquement";
      if (slugAvailable === false) e.slug = "Ce sous-domaine est déjà utilisé";
    }
    if (step === 3) {
      if (!form.planId) e.planId = "Choisissez un plan pour continuer";
      const selectedPlan = plans.find((plan) => plan.id === form.planId);
      if (selectedPlan && selectedPlan.priceMonthly <= 0) {
        e.planId = "La création d'un club nécessite un plan payant.";
      } else if (selectedPlan && !form.countryCode) {
        e.countryCode = "Choisissez votre pays pour vérifier le paiement.";
      } else if (selectedPlan && form.countryCode === "TN") {
        e.countryCode = "Le paiement Stripe pour les nouveaux clubs n'est pas disponible en Tunisie.";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) { setStep((s) => s + 1); return; }
    // Final step — submit
    submit();
  };

  const submit = async () => {
    setSubmitting(true);
    setGlobalError(null);
    try {
      const res = await fetch("/api/onboarding/create-club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, verificationToken: emailVerificationToken }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.field) {
          setErrors({ [json.field]: json.error });
          // Go back to relevant step
          if (json.field === "email") setStep(0);
          if (json.field === "slug") setStep(1);
        } else {
          setGlobalError(json.error || "Erreur lors de la création du club.");
        }
        return;
      }
      if (json.paymentUrl) {
        window.location.href = json.paymentUrl;
        return;
      }
      // Free plans can still activate without checkout. Paid plans return a
      // checkout URL and never receive an authenticated bridge at this stage.
      if (!json.bridgeToken) {
        setGlobalError("Paiement confirmé, mais la connexion est indisponible. Contactez le support.");
        return;
      }
      const bridgeUrl = ownerSettingsDestination(json.club.slug, json.bridgeToken);
      window.location.href = bridgeUrl;
    } catch {
      setGlobalError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setSubmitting(false);
    }
  };

  const StepIcon = STEPS[step].icon;

  return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Zap size={28} className="text-[var(--primary)]" />
              <span className="text-xl font-bold text-primary">GymOS</span>
            </div>
            <h1 className="text-2xl font-bold text-primary mb-1">Créez votre gym en ligne</h1>
            <p className="text-muted text-sm">Votre club est activé après confirmation du paiement.</p>
          </div>

          {/* Step indicator */}
          <div className="flex justify-center mb-8">
            <StepIndicator current={step} total={STEPS.length} />
          </div>

          {/* Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            {/* Step header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                <StepIcon size={20} className="text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-xs text-muted">Étape {step + 1} sur {STEPS.length}</p>
                <h2 className="font-semibold text-primary">{STEPS[step].label}</h2>
              </div>
            </div>

            {/* Global error */}
            {globalError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-600 rounded-xl mb-4 text-sm">
                  <AlertCircle size={16} /> {globalError}
                </div>
            )}

            {/* Step content */}
            {step === 0 && (
              <Step1
                data={form}
                onChange={patch}
                errors={errors}
                emailCode={emailCode}
                onEmailCodeChange={setEmailCode}
                emailCodeSent={emailCodeSent}
                emailVerified={!!emailVerificationToken && verifiedEmail === form.email.trim().toLowerCase()}
                emailVerificationBusy={emailVerificationBusy}
                emailVerificationMessage={emailVerificationMessage}
                emailVerificationError={emailVerificationError}
                onSendEmailCode={() => void sendEmailCode()}
                onVerifyEmailCode={() => void verifyEmailCode()}
              />
            )}
            {step === 1 && <Step2 data={form} onChange={patch} errors={errors} slugChecking={slugChecking} slugAvailable={slugAvailable} />}
            {step === 2 && <Step3Design data={form} onChange={patch} />}
            {step === 3 && <Step3 data={form} onChange={patch} plans={plans} plansLoading={plansLoading} plansError={plansError} errors={errors} />}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border">
              {step > 0 ? (
                  <button
                      type="button"
                      onClick={() => setStep((s) => s - 1)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted hover:text-primary border border-border rounded-xl hover:border-[var(--primary)]/40 transition-all"
                  >
                    <ArrowLeft size={15} /> Retour
                  </button>
              ) : (
                  <span />
              )}
              <button
                  type="button"
                  onClick={next}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[var(--primary)] text-white rounded-xl text-sm font-medium hover:bg-[var(--primary-dark)] disabled:opacity-60 transition-all"
              >
                {submitting ? (
                    <><Loader2 size={15} className="animate-spin" /> Préparation du paiement…</>
                ) : step < STEPS.length - 1 ? (
                    <>Suivant <ArrowRight size={15} /></>
                ) : (
                    <>Continuer vers le paiement <Check size={15} /></>
                )}
              </button>
            </div>
          </div>

          {/* Login link */}
          <p className="text-center text-sm text-muted mt-4">
            Vous avez déjà un compte ?{" "}
            <a href="/platform/login" className="text-[var(--primary)] hover:underline font-medium">
              Se connecter
            </a>
          </p>
        </div>
      </div>
  );
}