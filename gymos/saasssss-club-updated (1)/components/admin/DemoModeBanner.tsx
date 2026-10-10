"use client";
// DemoModeBanner — shown at the top of /admin when the club subscription
// is in TRIALING status. Informs the owner that the club is in demo mode
// with the default design and guides them to personalise it or upgrade.

import { useState } from "react";
import Link from "next/link";
import { Zap, X, ArrowRight, Palette } from "lucide-react";
import { useDaysUntil } from "@/hooks/useDaysUntil";

interface DemoModeBannerProps {
  trialEndsAt: string | null;
}

export default function DemoModeBanner({ trialEndsAt }: DemoModeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const daysLeft = useDaysUntil(trialEndsAt);

  if (dismissed) return null;

  const isUrgent = daysLeft !== null && daysLeft <= 3;

  return (
    <div
      className={`relative flex flex-col sm:flex-row items-start sm:items-center gap-4 px-5 py-4 rounded-2xl border mb-6 ${
        isUrgent
          ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
          : "bg-emerald-500/8 border-emerald-500/25 text-emerald-800 dark:text-emerald-200"
      }`}
    >
      {/* Icon */}
      <div
        className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          isUrgent
            ? "bg-red-500/15"
            : "bg-emerald-500/15"
        }`}
      >
        <Zap
          size={20}
          className={isUrgent ? "text-red-500" : "text-emerald-500"}
        />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">
          {isUrgent
            ? `Mode demo — Plus que ${daysLeft} jour${daysLeft !== 1 ? "s" : ""} d'essai`
            : trialEndsAt
            ? `Mode demo — Essai gratuit${daysLeft !== null ? ` (${daysLeft} jour${daysLeft !== 1 ? "s" : ""} restants)` : ""}`
            : "Mode demo — Essai gratuit"}
        </p>
        <p className="text-xs opacity-80 mt-0.5">
          Votre club utilise actuellement le design par defaut. Personnalisez-le pour le rendre unique.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/admin/settings"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            isUrgent
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          }`}
        >
          <Palette size={13} />
          Personnaliser
          <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fermer la banniere"
          className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
