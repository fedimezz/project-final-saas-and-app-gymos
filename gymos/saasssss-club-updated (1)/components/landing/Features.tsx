"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Users, CalendarDays, BookOpen, CreditCard, UserCog,
  Bell, BarChart3, Building2,
} from "lucide-react";

const FEATURES = [
  {
    icon: Users,
    title: "Gestion des membres",
    description: "Gérez les profils, abonnements et l'activité de chaque membre en un seul endroit.",
  },
  {
    icon: CalendarDays,
    title: "Planification",
    description: "Créez et gérez vos cours, coachs et plannings hebdomadaires facilement.",
  },
  {
    icon: BookOpen,
    title: "Réservation en ligne",
    description: "Permettez à vos membres de réserver leurs séances disponibles directement en ligne.",
  },
  {
    icon: CreditCard,
    title: "Paiements & revenus",
    description: "Suivez les abonnements et le chiffre d'affaires de votre salle en temps réel.",
  },
  {
    icon: UserCog,
    title: "Coachs",
    description: "Gérez vos coachs, leurs séances et le coaching individuel.",
  },
  {
    icon: Bell,
    title: "Notifications",
    description: "Tenez vos membres informés des plannings, annonces et rappels importants.",
  },
  {
    icon: BarChart3,
    title: "Analytique",
    description: "Donnez aux propriétaires une vraie visibilité sur la performance du club.",
  },
  {
    icon: Building2,
    title: "Multi-établissements",
    description: "Chaque salle dispose de son propre espace isolé, avec sa configuration dédiée.",
  },
];

export default function Features() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="features" className="section-padding scroll-mt-24">
      <div className="container-custom">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Fonctionnalités</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Tout ce qu&apos;il faut pour piloter votre club.
          </h2>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
              className="group card-hover rounded-2xl p-6"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 transition-transform duration-300 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-slate-950">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-extrabold text-primary">{f.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-secondary">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
