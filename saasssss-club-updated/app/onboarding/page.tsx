"use client";

import { useState, useEffect } from "react";
import {
  Building2, User, CreditCard, Check, ArrowRight, ArrowLeft,
  Loader2, Eye, EyeOff, Zap, AlertCircle, Smartphone, MessageCircle,
} from "lucide-react";
import CountrySelect from "@/components/payments/CountrySelect";
import ThemePicker from "@/components/admin/ThemePicker";
import type { ThemePreset } from "@/lib/website-themes";
import { formatMembershipPrice } from "@/lib/payment-currencies";
import PlanRowCard, { PlanRowList } from "@/components/pricing/PlanRowCard";
import BillingPeriodToggle from "@/components/billing/BillingPeriodToggle";
import DownloadAppCard from "@/components/app/DownloadAppCard";
import { BILLING_PERIOD_SUFFIX, planPrice, yearlySavingsPercent, type BillingPeriod } from "@/lib/billing-period";
import { MANUAL_METHODS, MANUAL_METHOD_LABEL, type ManualMethod } from "@/lib/manual-payment-shared";

// ── Types ────────────────────────────────────────────────────────────────────

interface SaasPlan {
  id: string;
  tier: "STARTER" | "PRO" | "BUSINESS";
  name: string;
  priceMonthly: number;
  priceYearly?: number | null;
  currency: string;
  limits: Record<string, unknown>;
}

/** TRIAL = free 14 days · PAID = pay now by card (Stripe) · MANUAL = pay now by transfer / D17 / Flouci / cash. */
type SignupMode = "TRIAL" | "PAID" | "MANUAL";

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
  /** TRIAL = 14 days free, no card (default). PAID = pay now with Stripe Checkout. */
  signupMode: SignupMode;
  billingPeriod: BillingPeriod;
  // Only for signupMode MANUAL
  manualMethod: ManualMethod;
  manualPhone: string;
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

const LIMIT_LABELS: Record<string, string> = {
  maxMembers: "membres",
  maxCoaches: "coachs",
  maxAdmins: "admins",
  maxBookingsPerMonth: "réservations / mois",
};
const FEATURE_LABELS: Record<string, string> = {
  advancedAnalytics: "Analytics avancées",
  customDomain: "Domaine personnalisé",
  customHeroModel: "Votre propre modèle 3D",
};
const DISPLAY_LIMIT_KEYS = ["maxMembers", "maxCoaches", "maxAdmins", "maxBookingsPerMonth", "advancedAnalytics", "customDomain", "customHeroModel"];

/** The bullet list of one plan: counts ("Illimité" when null) and the features it includes (unavailable ones are not listed). */
function planFeatures(plan: SaasPlan): string[] {
  const out: string[] = [];
  for (const key of DISPLAY_LIMIT_KEYS) {
    const val = plan.limits[key];
    if (val === undefined) continue;
    if (key in FEATURE_LABELS) {
      if (val === true) out.push(FEATURE_LABELS[key]);
      continue;
    }
    out.push(val === null ? `${LIMIT_LABELS[key] ?? key} illimités` : `${val} ${LIMIT_LABELS[key] ?? key}`);
  }
  return out;
}

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

function ModeCard({ selected, onSelect, title, text, disabled }: { selected: boolean; onSelect: () => void; title: string; text: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex-1 rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? "border-[var(--primary)] bg-[var(--primary)]/5" : "border-border hover:border-[var(--primary)]/40"
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-bold text-primary">
        {title}
        {selected && <Check size={15} className="text-[var(--primary)]" aria-hidden />}
      </span>
      <span className="mt-1 block text-xs text-muted">{text}</span>
    </button>
  );
}

/** Where a paid signup can go: card (Stripe) when Stripe is configured and the country allows it, else "contact us". */
function cardPaymentAvailable(countryCode: string, stripeEnabled: boolean | null): boolean {
  return stripeEnabled === true && countryCode.toUpperCase() !== "TN";
}

function Step3({ data, onChange, plans, plansLoading, plansError, errors, stripeEnabled }: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
  plans: SaasPlan[];
  plansLoading: boolean;
  plansError: boolean;
  errors: Record<string, string>;
  /** null = not known yet (treated as "no card": the contact route is always safe). */
  stripeEnabled: boolean | null;
}) {
  const period = data.billingPeriod;
  const yearlyAvailable = plans.some((p) => planPrice(p, "YEARLY") !== null);
  const bestSavings = Math.max(0, ...plans.map((p) => yearlySavingsPercent(p)));
  const cardAvailable = cardPaymentAvailable(data.countryCode, stripeEnabled);
  // Two top-level choices: FREE (14-day trial, no payment) or PAID. A paid signup is Stripe when card
  // payment is available, otherwise "contact us" (manual request approved by the team).
  const mode: SignupMode = data.signupMode === "TRIAL" ? "TRIAL" : cardAvailable && data.signupMode === "PAID" ? "PAID" : "MANUAL";
  const isPaid = mode !== "TRIAL";
  const cardUnavailableReason = data.countryCode.toUpperCase() === "TN"
    ? "Le paiement par carte n'est pas disponible en Tunisie."
    : "Le paiement par carte n'est pas encore activé.";

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
        <div className="max-w-md">
          <CountrySelect value={data.countryCode} onChange={(countryCode) => onChange({ countryCode })} />
          <FieldError msg={errors.countryCode} />
        </div>

        {/* 1 — Free or paid? */}
        <div role="radiogroup" aria-label="Gratuit ou payant" className="flex flex-col gap-3 sm:flex-row">
          <ModeCard
            selected={!isPaid}
            onSelect={() => onChange({ signupMode: "TRIAL" })}
            title="Essai gratuit — 14 jours"
            text="Sans carte bancaire, sans paiement. Votre club est activé immédiatement avec toutes les fonctions du plan choisi. À la fin, vous choisissez de continuer ou non ; vos données sont conservées."
          />
          <ModeCard
            selected={isPaid}
            onSelect={() => onChange({ signupMode: cardAvailable ? "PAID" : "MANUAL" })}
            title="Plan payant"
            text={cardAvailable
              ? "Payez par carte (Stripe, sécurisé) ou contactez-nous pour payer sans carte. Votre club est activé dès que le paiement est confirmé."
              : "Contactez-nous : virement, D17, Flouci ou espèces. Votre club est activé dès que notre équipe a vérifié le paiement."}
          />
        </div>

        {/* 2 — Paid: Stripe, or contact us when Stripe is not available */}
        {isPaid && cardAvailable && (
          <div role="radiogroup" aria-label="Moyen de paiement" className="flex flex-col gap-3 sm:flex-row">
            <ModeCard
              selected={mode === "PAID"}
              onSelect={() => onChange({ signupMode: "PAID" })}
              title="Carte bancaire (Stripe)"
              text="Vous êtes redirigé vers Stripe pour payer, puis votre club est activé automatiquement."
            />
            <ModeCard
              selected={mode === "MANUAL"}
              onSelect={() => onChange({ signupMode: "MANUAL" })}
              title="Nous contacter / payer sans carte"
              text="Virement, D17, Flouci ou espèces. Nous vous contactons pour finaliser."
            />
          </div>
        )}
        {isPaid && !cardAvailable && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
            <MessageCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>{cardUnavailableReason} Envoyez-nous votre demande ci-dessous : nous vous contactons, vous payez par le moyen de votre choix et nous activons votre club.</span>
          </div>
        )}
        {mode === "MANUAL" && (
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-secondary">
              Moyen de paiement
              <select
                value={data.manualMethod}
                onChange={(e) => onChange({ manualMethod: e.target.value as ManualMethod })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary"
              >
                {MANUAL_METHODS.map((m) => <option key={m} value={m}>{MANUAL_METHOD_LABEL[m]}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-secondary">
              Téléphone / WhatsApp pour vous contacter
              <input
                type="tel"
                value={data.manualPhone || data.phone}
                onChange={(e) => onChange({ manualPhone: e.target.value })}
                placeholder="+216 20 123 456"
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary"
              />
            </label>
            <FieldError msg={errors.manualPhone} />
            <p className="text-xs text-muted sm:col-span-2">Votre club est créé mais reste fermé jusqu&apos;à validation du paiement. Aucun accès avant approbation.</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {mode === "TRIAL" ? "Facturation après l'essai :" : "Facturation :"}
          </p>
          <BillingPeriodToggle value={period} onChange={(billingPeriod) => onChange({ billingPeriod })} savingsPercent={bestSavings} yearlyAvailable={yearlyAvailable} />
        </div>

        {/* Horizontal rows (identity | features | price + button) — same card as the pricing pages. */}
        <PlanRowList className="gap-6 pt-3">
          {plans.map((plan) => {
            const selected = data.planId === plan.id;
            const price = planPrice(plan, period);
            const unavailable = plan.priceMonthly <= 0 || price === null;
            const savings = yearlySavingsPercent(plan);
            return (
              <PlanRowCard
                key={plan.id}
                eyebrow={plan.tier}
                name={plan.name}
                features={planFeatures(plan)}
                price={unavailable ? "—" : formatMembershipPrice(price, plan.currency)}
                period={unavailable ? undefined : BILLING_PERIOD_SUFFIX[period]}
                priceNote={
                  unavailable
                    ? "Indisponible pour cette période"
                    : mode === "TRIAL"
                      ? `14 jours gratuits, puis ${period === "YEARLY" ? "facturation annuelle" : "facturation mensuelle"}.${period === "YEARLY" && savings > 0 ? ` Économisez ${savings} %.` : ""}`
                      : period === "YEARLY" && savings > 0 ? `Économisez ${savings} % par rapport au mensuel.` : undefined
                }
                highlighted={selected}
                badge="Sélectionné"
                action={{
                  label: selected ? (
                    <>
                      <Check size={15} aria-hidden="true" /> Plan choisi
                    </>
                  ) : mode === "TRIAL" ? (
                    "Essayer gratuitement"
                  ) : mode === "PAID" ? (
                    "Choisir et payer par carte"
                  ) : (
                    "Choisir ce plan"
                  ),
                  onClick: () => onChange({ planId: plan.id }),
                  disabled: unavailable,
                }}
              />
            );
          })}
        </PlanRowList>
        <FieldError msg={errors.planId} />
      </div>
  );
}

/** Dedicated onboarding step: the mobile app (not part of the plan / payment step). */
function StepApp({ clubName, slug }: { clubName: string; slug: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-secondary">
        ClubX existe aussi en application mobile pour vous, vos coachs et vos membres : planning, réservations et notifications.
      </p>
      <DownloadAppCard />
      <div className="rounded-xl bg-[var(--primary)]/5 p-4 text-sm text-primary">
        <p className="mb-1 text-xs font-bold uppercase text-muted">Comment vos membres trouvent {clubName.trim() || "votre club"}</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Ils installent l&apos;application ClubX (lien ci-dessus, ou la page <b>/download</b> de votre site).</li>
          <li>Ils cherchent le nom de votre club{slug ? <> (ou <b>{slug}</b>)</> : null} dans l&apos;application.</li>
          <li>Ils se connectent ou créent leur compte, et retrouvent leur club.</li>
        </ol>
      </div>
      <p className="text-xs text-muted">Vous pouvez passer cette étape : la page de téléchargement reste disponible sur le site de votre club et sur le site ClubX.</p>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Votre compte",   icon: User },
  { label: "Votre club",     icon: Building2 },
  { label: "Votre design",   icon: Zap },
  { label: "Application mobile", icon: Smartphone },
  { label: "Choisir un plan", icon: CreditCard },
];

export default function OnboardingWizardPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({
    name: "", email: "", password: "", phone: "",
    clubName: "", slug: "", planId: "", signupMode: "TRIAL", billingPeriod: "MONTHLY", manualMethod: "BANK_TRANSFER", manualPhone: "", countryCode: "", themeId: "classic",
    primaryColor: "#4f46e5", secondaryColor: "#3b82f6",
    heroTitle: "", heroSubtitle: "", address: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState(false);
  // Whether card payment (Stripe) is configured on this deployment. null = unknown yet → "contact us" route.
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null);
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
        if (cancelled) return;
        if (typeof data.stripeEnabled === "boolean") setStripeEnabled(data.stripeEnabled);
        if (typeof data.countryCode === "string") {
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

    // Free = trial. Paid = Stripe when available, else "contact us" (manual). Mirrors Step3's effective mode.
  const cardAvailable = cardPaymentAvailable(form.countryCode, stripeEnabled);
  const payCard = form.signupMode === "PAID" && cardAvailable;
  const payManual = form.signupMode === "MANUAL" || (form.signupMode === "PAID" && !cardAvailable);
  const payNow = payCard; // card payment redirects to Stripe; manual payment shows a confirmation screen
  const [manualResult, setManualResult] = useState<{ instructions: string; amount: number; currency: string; slug: string } | null>(null);

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
    if (step === 4) {
      if (!form.planId) e.planId = "Choisissez un plan pour continuer";
      const selectedPlan = plans.find((plan) => plan.id === form.planId);
      if (selectedPlan && (selectedPlan.priceMonthly <= 0 || planPrice(selectedPlan, form.billingPeriod) === null)) {
        e.planId = "Ce plan n'est pas disponible pour la période choisie.";
      }
      if (payNow && !form.countryCode) e.countryCode = "Sélectionnez votre pays pour payer par carte.";
      if (payManual && (form.manualPhone || form.phone).trim().length < 6) e.manualPhone = "Indiquez un numéro pour que nous puissions vous contacter.";
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
        body: JSON.stringify({
          ...form,
          // The server decides everything that matters (plan visibility, price, trial rules); this only
          // says which of the two signup paths the owner picked.
          startTrial: !(payCard || payManual),
          ...(payManual ? { payWith: "MANUAL", method: form.manualMethod, contactPhone: (form.manualPhone || form.phone).trim() } : {}),
          billingPeriod: form.billingPeriod,
          verificationToken: emailVerificationToken,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "STRIPE_UNAVAILABLE") {
          // Card payment is not available after all: fall back to the contact / pay-without-card route.
          setStripeEnabled(false);
          setForm((current) => ({ ...current, signupMode: "MANUAL" }));
          setGlobalError(json.error);
        } else if (json.field) {
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
      if (json.pendingManualPayment) {
        setManualResult({ instructions: json.instructions, amount: json.amount, currency: json.currency, slug: json.club.slug });
        return;
      }
      // Free plans can still activate without checkout. Paid plans return a
      // checkout URL and never receive an authenticated bridge at this stage.
      if (!json.bridgeToken) {
        setGlobalError("Club créé, mais la connexion automatique a échoué. Connectez-vous depuis la page de connexion.");
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

  // After a "pay without card" signup: the club exists but stays closed until approval + payment check.
  if (manualResult) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-primary">
            <Check size={22} className="text-emerald-500" />
            <h1 className="text-xl font-bold">Demande envoyée</h1>
          </div>
          <p className="text-sm text-secondary">
            Votre club <b>{manualResult.slug}</b> est créé, mais il reste fermé jusqu&apos;à ce que notre équipe approuve votre demande et vérifie le paiement de <b>{manualResult.amount} {manualResult.currency}</b>.
          </p>
          <div className="rounded-xl bg-[var(--primary)]/5 p-3 text-sm text-primary">
            <p className="mb-1 text-xs font-bold uppercase text-muted">Comment payer</p>
            <p className="whitespace-pre-line">{manualResult.instructions}</p>
          </div>
          <p className="text-xs text-muted">
            Une fois le paiement vérifié, connectez-vous avec l&apos;e-mail et le mot de passe que vous venez de créer. Vous pouvez modifier votre demande depuis la page de réactivation.
          </p>
          <a href="/reactivate" className="inline-block text-sm font-semibold text-[var(--primary)] underline">Modifier ma demande</a>
        </div>
      </div>
    );
  }

  return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {/* The plan step shows horizontal price rows, so it needs more width than the form steps. */}
        <div className={`w-full transition-[max-width] duration-300 ${step === 4 ? "max-w-5xl" : "max-w-lg"}`}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Zap size={28} className="text-[var(--primary)]" />
              <span className="text-xl font-bold text-primary">ClubX</span>
            </div>
            <h1 className="text-2xl font-bold text-primary mb-1">Créez votre gym en ligne</h1>
            <p className="text-muted text-sm">14 jours d&apos;essai gratuit — sans carte bancaire.</p>
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
            {step === 3 && <StepApp clubName={form.clubName} slug={form.slug} />}
            {step === 4 && <Step3 data={form} onChange={patch} plans={plans} plansLoading={plansLoading} plansError={plansError} errors={errors} stripeEnabled={stripeEnabled} />}

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
                    <><Loader2 size={15} className="animate-spin" /> {payNow ? "Préparation du paiement…" : payManual ? "Envoi de votre demande…" : "Création de votre club…"}</>
                ) : step < STEPS.length - 1 ? (
                    <>Suivant <ArrowRight size={15} /></>
                ) : (
                    payNow ? <>Payer et créer mon club <Check size={15} /></> : payManual ? <>Envoyer ma demande <Check size={15} /></> : <>Démarrer mon essai gratuit <Check size={15} /></>
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