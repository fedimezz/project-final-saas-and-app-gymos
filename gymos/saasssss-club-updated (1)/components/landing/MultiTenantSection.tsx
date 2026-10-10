"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Building2, Users, CalendarDays, Palette, Settings, Database } from "lucide-react";

const ISOLATED_ITEMS = [
  { icon: Users, label: "Membres" },
  { icon: Users, label: "Coachs" },
  { icon: CalendarDays, label: "Planning" },
  { icon: Palette, label: "Branding" },
  { icon: Settings, label: "Paramètres" },
  { icon: Database, label: "Données" },
];

export default function MultiTenantSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="multi-tenant" className="section-padding scroll-mt-24 bg-muted/40">
      <div className="container-custom">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Copy */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, x: -20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
          >
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Architecture SaaS</span>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
              Conçu pour chaque salle. Prêt à grandir.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-secondary sm:text-base">
              Chaque club dispose de son propre espace de travail entièrement isolé — ses membres,
              ses coachs, son planning, son identité visuelle, ses paramètres et ses données
              n&apos;appartiennent qu&apos;à lui.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ISOLATED_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
                  <item.icon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <span className="text-xs font-bold text-primary">{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Simple architecture visual */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, x: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center"
          >
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-center">
              <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-500">Plateforme GymOS</p>
            </div>
            <div className="my-3 h-8 w-px bg-border" />
            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
              {["Gym A", "Gym B", "Gym C", "Gym D"].map((name) => (
                <div
                  key={name}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-4 py-5 shadow-sm"
                >
                  <Building2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-xs font-bold text-primary">{name}</span>
                  <span className="text-[10px] text-muted">Espace isolé</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
