"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Users, CreditCard, CalendarClock, BarChart3 } from "lucide-react";

const POINTS = [
  { icon: Users, label: "Membres & abonnements" },
  { icon: CalendarClock, label: "Plannings & réservations" },
  { icon: CreditCard, label: "Paiements & revenus" },
  { icon: BarChart3, label: "Analytique & performance" },
];

export default function TrustSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-y border-border bg-muted/40 py-14">
      <div className="container-custom">
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-2xl font-black tracking-tight text-primary sm:text-3xl">
            Tout ce dont vous avez besoin pour gérer votre business fitness.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-secondary sm:text-base">
            De la gestion des membres au suivi du chiffre d&apos;affaires, tout votre club fonctionne
            depuis une seule plateforme connectée.
          </p>
        </motion.div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {POINTS.map((p, i) => (
            <motion.div
              key={p.label}
              initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-6 text-center shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                <p.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-primary">{p.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
