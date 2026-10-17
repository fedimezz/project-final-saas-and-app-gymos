"use client";

import { CreditCard, Clock, Calendar, AlertCircle, Crown, Sparkles } from "lucide-react";
import { useDaysUntil } from "@/hooks/useDaysUntil";
import { formatMembershipPrice } from "@/lib/payment-currencies";

interface Subscription {
  id: string;
  endDate: string;
  status: string;
  plan: { name: string; price: number; currency: string };
}

interface Props {
  subscription: Subscription | null;
}

export default function ProfileSubscriptionCard({ subscription }: Props) {
  const daysLeft = useDaysUntil(subscription?.endDate);

  const isExpiringSoon = daysLeft <= 7 && daysLeft > 0;
  const isExpired = daysLeft === 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <h3 className="font-semibold text-primary mb-5 flex items-center gap-2">
        <Crown size={18} className="text-primary" />
        Abonnement actuel
      </h3>

      {subscription ? (
        <div className="space-y-4">
          {/* Plan header */}
          <div className="flex items-center justify-between p-4 bg-gradient-to-br from-muted to-muted/50 rounded-xl border border-border">
            <div>
              <p className="font-semibold text-primary flex items-center gap-2">
                {subscription.plan.name}
                <Sparkles size={14} className="text-warning" />
              </p>
              <p className="text-sm text-muted mt-0.5">
                {formatMembershipPrice(subscription.plan.price, subscription.plan.currency)} / mois
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
              isExpired
                ? "bg-danger/10 text-danger"
                : "bg-success/10 text-success"
            }`}>
              {isExpired ? (
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

          {/* Dates */}
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
            <div className={`p-4 rounded-xl transition-all ${
              isExpiringSoon ? "bg-danger/10 border border-danger/20" : "bg-muted"
            }`}>
              <p className="text-xs text-muted flex items-center gap-1 mb-1">
                <Calendar size={12} />
                Jours restants
              </p>
              <p
                className={`text-sm font-bold ${
                  isExpired
                    ? "text-danger"
                    : isExpiringSoon
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

          {/* Warning */}
          {isExpiringSoon && !isExpired && (
            <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>Votre abonnement expire bientôt. Pensez à le renouveler.</span>
            </div>
          )}

          {isExpired && (
            <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>Votre abonnement a expiré. Renouvelez-le pour continuer.</span>
            </div>
          )}

          {/* Renew button */}
          <button className="w-full py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors flex items-center justify-center gap-2">
            <CreditCard size={16} />
            Renouveler l&apos;abonnement
          </button>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Crown size={28} className="text-muted" />
          </div>
          <p className="text-muted">Aucun abonnement actif.</p>
          <a
            href="/dashboard/subscription"
            className="mt-4 inline-block px-6 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            Voir les plans →
          </a>
        </div>
      )}
    </div>
  );
}