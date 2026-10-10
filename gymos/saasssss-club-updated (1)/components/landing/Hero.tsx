"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, PlayCircle, Users, TrendingUp, CalendarDays,
  CheckCircle2, Bell, Activity,
} from "lucide-react";
import StatCard from "@/components/admin/StatCard";

export default function Hero() {
  const reduceMotion = useReducedMotion();
  const fadeUp = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="relative overflow-hidden pt-16 pb-24 lg:pt-24 lg:pb-32">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-10%] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-sky-500/10 blur-[100px]" />
      </div>

      <div className="container-custom">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Copy */}
          <div>
            <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold text-emerald-500">
              <Activity className="h-3.5 w-3.5" />
              Conçu pour les salles de sport modernes
            </motion.div>

            <motion.h1 {...fadeUp(0.08)} className="mt-6 text-4xl font-black leading-[1.1] tracking-tight text-primary sm:text-5xl lg:text-[3.4rem]">
              La façon la plus intelligente de gérer votre salle de sport.
            </motion.h1>

            <motion.p {...fadeUp(0.16)} className="mt-6 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
              Tout ce dont votre club fitness a besoin pour gérer membres, coachs, abonnements,
              plannings et opérations quotidiennes — sur une seule plateforme puissante.
            </motion.p>

            <motion.div {...fadeUp(0.24)} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/onboarding">
                <button className="group flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/25 transition duration-300 hover:bg-emerald-400 active:scale-95 sm:w-auto">
                  Démarrer gratuitement
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </Link>
              <a href="#product-showcase">
                <button className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-bold text-primary transition duration-300 hover:border-[var(--primary)]/40 active:scale-95 sm:w-auto">
                  <PlayCircle className="h-4 w-4 text-emerald-500" />
                  Voir la démo
                </button>
              </a>
            </motion.div>

            <motion.div {...fadeUp(0.32)} className="mt-8 flex items-center gap-2 text-xs font-semibold text-muted">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Gérez tout votre club depuis une seule plateforme
            </motion.div>
          </div>

          {/* Product preview mockup — built from real dashboard components/tokens,
              with illustrative sample numbers (no live API calls here). */}
          <motion.div
            {...fadeUp(0.2)}
            className="relative"
          >
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-emerald-500/15 via-transparent to-sky-500/10 blur-2xl" />

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <div className="ml-3 flex-1 truncate rounded-full bg-card px-3 py-1 text-[10px] font-medium text-muted">
                  votregym.gymos.app/admin
                </div>
              </div>

              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Tableau de bord</p>
                    <p className="text-sm font-black text-primary">Vue d&apos;ensemble du club</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                    <Bell className="h-4 w-4" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatCard title="Membres actifs" value="482" icon={Users} color="green" trend={{ value: "+12%", up: true }} />
                  <StatCard title="Revenu du mois" value="14 250 DT" icon={TrendingUp} color="blue" trend={{ value: "+8%", up: true }} />
                  <StatCard title="Sessions cette semaine" value="96" icon={CalendarDays} color="purple" />
                  <StatCard title="Taux de présence" value="87%" icon={Activity} color="amber" />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-muted/60 p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Planning du jour</p>
                  <div className="space-y-2">
                    {[
                      { name: "CrossFit — Coach Yassine", time: "18:00", full: false },
                      { name: "Yoga Flow — Coach Sarra", time: "19:00", full: true },
                    ].map((s) => (
                      <div key={s.name} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-xs">
                        <span className="font-semibold text-primary">{s.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.full ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                          {s.time} {s.full ? "· Complet" : "· Places dispo"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
