"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, PlayCircle } from "lucide-react";

export default function FinalCTA() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-padding">
      <div className="container-custom">
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-8 py-16 text-center shadow-2xl sm:px-16"
        >
          <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[100px]" />

          <h2 className="relative text-3xl font-black tracking-tight text-white sm:text-4xl">
            Prêt à gérer votre salle plus intelligemment ?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-slate-300 sm:text-base">
            Réunissez vos membres, coachs et opérations sur une seule plateforme puissante.
          </p>

          <div className="relative mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/onboarding">
              <button className="group flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/30 transition duration-300 hover:bg-emerald-400 active:scale-95 sm:w-auto">
                Démarrer gratuitement
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
            <a href="#product-showcase">
              <button className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-7 py-3.5 text-sm font-bold text-white transition duration-300 hover:border-slate-500 active:scale-95 sm:w-auto">
                <PlayCircle className="h-4 w-4 text-emerald-400" />
                Voir la démo
              </button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
