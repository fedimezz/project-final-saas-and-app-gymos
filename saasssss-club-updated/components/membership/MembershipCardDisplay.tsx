"use client";

import { CreditCard, Calendar, CheckCircle, XCircle } from "lucide-react";

interface Props {
  card: {
    cardNumber: string;
    isActive: boolean;
    expiresAt: string | null;
  } | null;
}

export default function MembershipCardDisplay({ card }: Props) {
  const isExpired = card ? !card.expiresAt || new Date(card.expiresAt) < new Date() : false;
  const status = card ? (card.isActive && !isExpired ? "active" : "expired") : "none";

  const formatCardNumber = (number: string) => number.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="bg-card border border-border rounded-2xl p-6 transition-all hover:shadow-md">
      <h3 className="font-semibold text-primary mb-4 flex items-center gap-2">
        <CreditCard size={18} className="text-[var(--primary)]" />
        Carte Membre
      </h3>

      {card ? (
        <div className="bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] rounded-xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <p className="text-xs opacity-70 mb-1 uppercase tracking-wider">Numéro de carte</p>
            <p className="font-mono font-bold tracking-widest text-sm">
              {formatCardNumber(card.cardNumber)}
            </p>
            <div className="flex justify-between items-end mt-4">
              <div>
                <p className="text-xs opacity-70">Fin de mon abonnement</p>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Calendar size={14} />
                  {card.expiresAt
                    ? new Date(card.expiresAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "Aucun abonnement actif"}
                </p>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                  status === "active" ? "bg-white/20" : "bg-white/10"
                }`}
              >
                {status === "active" ? (
                  <>
                    <CheckCircle size={12} />
                    Active
                  </>
                ) : (
                  <>
                    <XCircle size={12} />
                    Expirée
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CreditCard size={28} className="text-muted" />
          </div>
          <p className="text-sm text-muted">Aucune carte émise.</p>
          <p className="text-xs text-muted mt-1">Contactez l&apos;accueil pour en obtenir une.</p>
        </div>
      )}
    </div>
  );
}