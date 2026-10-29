import { CreditCard, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";

interface Props {
  planName: string | null;
  daysUntilExpiry: number | null;
  isActive: boolean;
}

export default function MembershipCard({ planName, daysUntilExpiry, isActive }: Props) {
  return (
    <div className="relative group overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950 text-white p-7 shadow-2xl border border-emerald-500/30 backdrop-blur-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-emerald-500/10">
      {/* Holographic Background Accents */}
      <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-xl translate-y-1/3 -translate-x-1/3 pointer-events-none" />

      {/* Holographic metallic line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400" />

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">Pass Membre VIP</p>
          </div>
          <div className="p-2 rounded-xl bg-white/10 backdrop-blur-md">
            <CreditCard className="h-4 w-4 text-white" />
          </div>
        </div>

        {isActive && planName ? (
          <>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-4 text-white flex items-center gap-2">
              {planName}
              <ShieldCheck className="h-5 w-5 text-emerald-400 inline" />
            </h2>
            <div className="mt-6 flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-xs font-semibold text-slate-300">
                {daysUntilExpiry !== null
                  ? `Expire dans ${daysUntilExpiry} jour${daysUntilExpiry > 1 ? "s" : ""}`
                  : "Abonnement Actif"}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VALIDE 7J/7
              </span>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-black tracking-tight mt-4 text-slate-200">Aucun abonnement actif</h2>
            <p className="text-xs text-slate-400 mt-1">Rejoignez l&apos;élite sportive et débloquez votre accès 7j/7.</p>
            <a
              href="/dashboard/membership"
              className="mt-6 inline-flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition duration-300 active:scale-95"
            >
              <span>Découvrir nos offres</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}