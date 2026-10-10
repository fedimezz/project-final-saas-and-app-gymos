"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Building2, Settings2, TrendingUp } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: Building2,
    title: "Créez votre salle",
    description: "Configurez votre club et personnalisez votre espace de travail en quelques minutes.",
  },
  {
    number: "02",
    icon: Settings2,
    title: "Gérez tout",
    description: "Membres, coachs, plannings, abonnements et opérations — tout depuis un seul endroit.",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Développez votre activité",
    description: "Utilisez l'analytique et l'automatisation pour faire progresser votre club.",
  },
];

export default function HowItWorks() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-padding">
      <div className="container-custom">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Comment ça marche</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Opérationnel en trois étapes simples.
          </h2>
        </div>

        <div className="relative mt-16 grid gap-8 md:grid-cols-3">
          <div className="pointer-events-none absolute top-10 left-0 right-0 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative text-center"
            >
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-md">
                <step.icon className="h-8 w-8 text-emerald-500" />
                <span className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-black text-slate-950">
                  {step.number}
                </span>
              </div>
              <h3 className="mt-5 text-base font-extrabold text-primary">{step.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-secondary">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
