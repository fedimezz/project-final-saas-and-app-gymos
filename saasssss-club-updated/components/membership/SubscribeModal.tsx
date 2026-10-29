"use client";

import { useState } from "react";
import { X, Loader2, CreditCard, Building2, CheckCircle, AlertCircle, ShieldCheck } from "lucide-react";
import CountrySelect from "@/components/payments/CountrySelect";
import { canStripeChargeMembershipCurrency, formatMembershipPrice } from "@/lib/payment-currencies";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  features: string[];
}

interface Props {
  plan: Plan;
  countryCode: string;
  onCountryChange: (countryCode: string) => void;
  onClose: () => void;
  /**
   * Returns either:
   *  - { ok: true }                    → ONSITE request registered
   *  - { ok: true, paymentUrl: string } → ONLINE: caller should redirect
   *  - { ok: false }                   → failed, error already toasted by parent
   */
  onSubscribe: (
    planId: string,
    paymentMethod: "ONLINE" | "ONSITE",
    countryCode: string
  ) => Promise<{ ok: boolean; paymentUrl?: string }>;
}

export default function SubscribeModal({ plan, countryCode, onCountryChange, onClose, onSubscribe }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const method = countryCode === "TN" ? "ONSITE" : "ONLINE";
  const canPay = !!countryCode && (countryCode === "TN" || canStripeChargeMembershipCurrency(plan.currency));

  const handleConfirm = async () => {
    if (!canPay) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onSubscribe(plan.id, method, countryCode);

      if (!result.ok) {
        setError("Impossible de finaliser la demande. Réessayez.");
        return;
      }

      if (method === "ONLINE" && result.paymentUrl) {
        setRedirecting(true);
        window.location.href = result.paymentUrl;
        return;
      }

      setSuccess(true);
      setTimeout(() => onClose(), 1800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-primary">{plan.name}</h2>
            <p className="text-sm text-muted mt-0.5">
              {countryCode
                ? formatMembershipPrice(plan.price, plan.currency)
                : "Choisissez votre pays pour afficher le tarif"}
              {" • "}{plan.durationDays} jours
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted"
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {redirecting && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-xl text-[var(--primary)] text-sm animate-fade-in">
            <Loader2 size={16} className="flex-shrink-0 animate-spin" />
            Redirection vers la page de paiement sécurisée...
          </div>
        )}

        {success && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-success/10 border border-success/20 rounded-xl text-success text-sm animate-fade-in">
            <CheckCircle size={16} className="flex-shrink-0" />
            Demande enregistrée avec succès
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm animate-fade-in">
            <AlertCircle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {!success && !redirecting && (
          <>
            <CountrySelect value={countryCode} onChange={onCountryChange} />
            <p className="text-sm font-medium text-primary mb-3">Méthode de paiement</p>
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-border p-4">
              {countryCode === "TN" ? <Building2 size={22} className="text-[var(--primary)]" /> : <CreditCard size={22} className="text-[var(--primary)]" />}
              <span className="text-sm font-medium text-primary">
                {!countryCode ? "Sélectionnez un pays" : countryCode === "TN" ? "Paiement à l'accueil" : canPay ? "Paiement sécurisé par Stripe" : `Stripe indisponible en ${plan.currency}`}
              </span>
            </div>

            <p className="text-xs text-muted mb-6 flex items-start gap-1.5">
              {method === "ONLINE" ? (
                <>
                  <ShieldCheck size={14} className="flex-shrink-0 mt-0.5 text-[var(--primary)]" />
                  Vous serez redirigé vers Stripe. Votre abonnement s&apos;active uniquement après
                  confirmation du paiement par le serveur.
                </>
              ) : (
                countryCode === "TN"
                  ? "Réglez à l'accueil du club pour activer votre abonnement."
                  : "Sélectionnez votre pays pour choisir le moyen de paiement."
              )}
            </p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-border rounded-xl text-muted hover:bg-muted transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || !canPay}
                className="flex-1 flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : method === "ONLINE" ? (
                  "Payer maintenant"
                ) : (
                  "Confirmer"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
