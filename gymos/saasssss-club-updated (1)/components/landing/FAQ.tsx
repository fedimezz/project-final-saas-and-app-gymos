"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Qu'est-ce que cette plateforme ?",
    a: "GymOS est une plateforme SaaS tout-en-un qui permet aux salles de sport et clubs fitness de gérer leurs membres, coachs, plannings, abonnements et opérations quotidiennes depuis un seul espace.",
  },
  {
    q: "Puis-je gérer plusieurs salles ?",
    a: "Oui. Chaque salle dispose de son propre espace de travail isolé, avec ses membres, ses coachs et ses paramètres. Vous pouvez gérer plusieurs clubs depuis des espaces distincts.",
  },
  {
    q: "Les membres peuvent-ils réserver des séances en ligne ?",
    a: "Oui, vos membres peuvent consulter le planning et réserver leurs séances directement depuis leur espace personnel.",
  },
  {
    q: "Puis-je gérer mes coachs ?",
    a: "Oui, chaque coach dispose de son propre espace avec ses séances, son roster de membres et ses statistiques de performance.",
  },
  {
    q: "Puis-je personnaliser mon club ?",
    a: "Oui. Vous pouvez personnaliser le nom, le logo, les couleurs, le contenu et les pages publiques de votre club sans écrire de code.",
  },
  {
    q: "Les données de ma salle sont-elles isolées ?",
    a: "Oui. Chaque club a ses propres données, complètement isolées des autres clubs de la plateforme.",
  },
  {
    q: "Puis-je changer de plan ?",
    a: "Oui, vous pouvez mettre à niveau ou revenir à un plan inférieur à tout moment depuis votre espace propriétaire.",
  },
  {
    q: "Les membres ont-ils accès à la plateforme ?",
    a: "Oui, chaque membre dispose de son propre accès pour consulter son planning, ses réservations et son abonnement.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="section-padding scroll-mt-24">
      <div className="container-custom max-w-3xl">
        <div className="text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">FAQ</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Questions fréquentes.
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <span className="text-sm font-bold text-primary">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 flex-shrink-0 text-emerald-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-xs leading-relaxed text-secondary">{item.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
