// LandingFooter — the marketing footer shown ONLY when there is no resolved
// tenant (the SaaS product's own site). Rendered by components/layout/Footer.tsx
// in place of the per-gym footer when useClubSettings().hasTenant is false.

import Link from "next/link";
import { LayoutDashboard, Sparkles } from "lucide-react";

const COLUMNS = [
  {
    title: "Produit",
    links: [
      { name: "Fonctionnalités", href: "#features" },
      { name: "Tarifs", href: "#pricing" },
      { name: "Solutions", href: "#multi-tenant" },
    ],
  },
  {
    title: "Entreprise",
    links: [
      { name: "À propos", href: "#faq" },
      { name: "Contact", href: "mailto:hello@gymos.app" },
    ],
  },
  {
    title: "Ressources",
    links: [
      { name: "Documentation", href: "/onboarding" },
      { name: "FAQ", href: "#faq" },
      { name: "Support", href: "mailto:support@gymos.app" },
    ],
  },
  {
    title: "Légal",
    links: [
      { name: "Confidentialité", href: "#" },
      { name: "Conditions d'utilisation", href: "#" },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer className="relative bg-[#05080f] text-slate-200 border-t border-slate-800/80 overflow-hidden">
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <div className="container mx-auto px-4 md:px-6 py-20 relative z-10 max-w-6xl">
        <div className="grid gap-12 md:grid-cols-5">
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="h-9 w-9 rounded-xl bg-slate-900 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                <LayoutDashboard className="h-4.5 w-4.5" />
              </div>
              <span className="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
                GymOS <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              </span>
            </Link>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              La plateforme SaaS tout-en-un pour gérer votre salle de sport ou club fitness.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 mb-5">
                {col.title}
              </h4>
              <ul className="space-y-2.5 text-xs font-semibold text-slate-400">
                {col.links.map((link) => (
                  <li key={link.name}>
                    <a href={link.href} className="hover:text-emerald-400 transition-colors">
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-slate-900 text-center text-xs font-medium text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} GymOS. Tous droits réservés.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-400 transition-colors">Conditions d&apos;utilisation</a>
            <a href="#" className="hover:text-slate-400 transition-colors">Politique de confidentialité</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
