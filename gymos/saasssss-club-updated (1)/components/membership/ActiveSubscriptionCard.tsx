"use client";

import { Crown, Clock, Calendar, AlertCircle, Sparkles, Hourglass, Loader2, CreditCard } from "lucide-react";
import { useDaysUntil } from "@/hooks/useDaysUntil";
import { formatMembershipPrice } from "@/lib/payment-currencies";

interface ActiveSubscription {
  id: string;
  endDate: string;
  status: string;
  plan: { name: string; price: number; currency: string };
  payments: { status: string; paymentMethod?: string }[];
}

interface Props {
  subscription: ActiveSubscription | null;
  /** Present only when the pending subscription was paid ONLINE — lets the user re-open the payment page. */
  onResumePayment?: () => void;
  resuming?: boolean;
}

export default function ActiveSubscriptionCard({ subscription, onResumePayment, resuming }: Props) {
  const daysLeft = useDaysUntil(subscription?.endDate);

  const isExpiringSoon = daysLeft <= 7 && daysLeft > 0;
  const isExpired = daysLeft === 0;
  const isPending = subscription?.status === "PENDING";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <h3 className="font-semibold text-primary mb-5 flex items-center gap-2">
        <Crown size={18} className="text-[var(--primary)]" />
        Abonnement actuel
      </h3>

      {subscription ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gradient-to-br from-muted to-muted/50 rounded-xl border border-border">
            <div>
              <p className="font-semibold text-primary flex items-center gap-2">
                {subscription.plan.name}
                <Sparkles size={14} className="text-warning" />
              </p>
              <p className="text-sm text-muted mt-0.5">{formatMembershipPrice(subscription.plan.price, subscription.plan.currency)}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                isPending
                  ? "bg-warning/10 text-warning"
                  : isExpired
                  ? "bg-danger/10 text-danger"
                  : "bg-success/10 text-success"
              }`}
            >
              {isPending ? (
                <>
                  <Hourglass size={12} />
                  En attente
                </>
              ) : isExpired ? (
                <>
                  <AlertCircle size={12} />
                  Expiré
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Actif
                </>
              )}
            </span>
          </div>

          {isPending ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/20 rounded-xl text-warning text-sm">
                <Hourglass size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  {onResumePayment
                    ? "Votre paiement en ligne n'a pas été finalisé. Reprenez le paiement ci-dessous, ou rendez-vous à l'accueil."
                    : "Votre demande est en attente de confirmation. Rendez-vous à l'accueil pour finaliser le paiement."}
                </span>
              </div>
              {onResumePayment && (
                <button
                  onClick={onResumePayment}
                  disabled={resuming}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--primary)] text-white py-2.5 rounded-xl font-medium hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-60"
                >
                  {resuming ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CreditCard size={16} />
                  )}
                  {resuming ? "Ouverture du paiement..." : "Reprendre le paiement"}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-xl">
                <p className="text-xs text-muted flex items-center gap-1 mb-1">
                  <Clock size={12} />
                  Expire le
                </p>
                <p className="text-sm font-semibold text-primary">
                  {new Date(subscription.endDate).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div
                className={`p-4 rounded-xl transition-all ${
                  isExpiringSoon ? "bg-danger/10 border border-danger/20" : "bg-muted"
                }`}
              >
                <p className="text-xs text-muted flex items-center gap-1 mb-1">
                  <Calendar size={12} />
                  Jours restants
                </p>
                <p
                  className={`text-sm font-bold ${
                    isExpired || isExpiringSoon
                      ? "text-danger"
                      : daysLeft <= 14
                      ? "text-warning"
                      : "text-primary"
                  }`}
                >
                  {isExpired ? "Expiré" : `${daysLeft} jour${daysLeft !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Crown size={28} className="text-muted" />
          </div>
          <p className="text-muted">Aucun abonnement actif.</p>
          <p className="text-xs text-muted mt-1">Choisissez un plan ci-dessous pour commencer.</p>
        </div>
      )}
    </div>
  );
}
