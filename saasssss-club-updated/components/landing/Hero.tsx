"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, PlayCircle, Users, TrendingUp, CalendarDays,
  Bell, Activity, Smartphone, Palette, ShieldCheck,
} from "lucide-react";
import StatCard from "@/components/admin/StatCard";

const MARQUEE = [
  "Membres", "Coachs", "Planning", "Abonnements", "Paiements", "Réservations",
  "Site web du club", "Thèmes", "Modèles 3D", "Application mobile", "Notifications", "Rapports",
];

const CHIPS = [
  { icon: Smartphone, label: "Site web + app mobile" },
  { icon: Palette, label: "17 thèmes, modèles 3D" },
  { icon: ShieldCheck, label: "Un espace par club" },
];

export default function Hero() {
  const reduceMotion = useReducedMotion();
  const fadeUp = (delay = 0) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="relative overflow-hidden pt-28 pb-10 lg:pt-36">
      <div className="container-custom">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Copy */}
          <div>
            <motion.div
              {...fadeUp(0)}
              className="inline-flex items-center gap-2 rounded-full mono-glass border border-[color:var(--mono-line)] px-4 py-1.5 text-xs font-bold text-primary"
            >
              <Activity className="h-3.5 w-3.5" />
              La plateforme des clubs sportifs
            </motion.div>

            <motion.h1
              {...fadeUp(0.08)}
              className="mt-6 text-5xl font-black leading-[0.98] tracking-tighter text-primary sm:text-6xl lg:text-[4.6rem]"
            >
              Votre club,
              <br />
              <span className="mono-outline">sous contrôle</span>
              <span className="mono-cursor text-primary" aria-hidden="true" />
            </motion.h1>

            <motion.p {...fadeUp(0.16)} className="mt-7 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
              ClubX réunit membres, coachs, abonnements, plannings et paiements sur une seule
              plateforme — avec le site web de votre club et son application mobile.
            </motion.p>

            <motion.div {...fadeUp(0.24)} className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/onboarding">
                <button className="group flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-sm font-extrabold text-[color:var(--mono-on-accent)] shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-0.5 hover:bg-emerald-600 active:scale-95 sm:w-auto">
                  Créer mon club
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
              </Link>
              <a href="#product-showcase">
                <button className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-[color:var(--mono-ink)] bg-transparent px-8 py-[14px] text-sm font-bold text-primary transition duration-300 hover:bg-[color:var(--mono-ink)] hover:text-[color:var(--mono-paper)] active:scale-95 sm:w-auto">
                  <PlayCircle className="h-4 w-4" />
                  Voir la démo
                </button>
              </a>
            </motion.div>

            <motion.ul {...fadeUp(0.32)} className="mt-9 flex flex-wrap gap-2.5">
              {CHIPS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-full mono-glass border border-[color:var(--mono-line)] px-3.5 py-1.5 text-xs font-semibold text-secondary"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Product preview — built from the real dashboard components, with
              illustrative sample numbers (no live API calls here). */}
          <motion.div {...fadeUp(0.2)} className="relative">
            <div className="mono-float">
              <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-[color:var(--mono-ink)] opacity-[0.07] blur-2xl" />

              <div className="overflow-hidden rounded-2xl border-2 border-[color:var(--mono-ink)] bg-card shadow-2xl shadow-black/20">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--mono-ink)]" />
                  <span className="h-2.5 w-2.5 rounded-full border border-[color:var(--mono-ink)]" />
                  <span className="h-2.5 w-2.5 rounded-full border border-[color:var(--mono-ink)]" />
                  <div className="ml-3 flex-1 truncate rounded-full bg-card px-3 py-1 text-[10px] font-medium text-muted">
                    votregym.clubx.app/admin
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Tableau de bord</p>
                      <p className="text-sm font-black text-primary">Vue d&apos;ensemble du club</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--mono-ink)] text-[color:var(--mono-paper)]">
                      <Bell className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard title="Membres actifs" value="482" icon={Users} color="green" trend={{ value: "+12%", up: true }} />
                    <StatCard title="Revenu du mois" value="14 250 DT" icon={TrendingUp} color="blue" trend={{ value: "+8%", up: true }} />
                    <StatCard title="Sessions cette semaine" value="96" icon={CalendarDays} color="purple" />
                    <StatCard title="Taux de présence" value="87%" icon={Activity} color="amber" />
                  </div>

                  <div className="mt-4 rounded-xl border border-border bg-muted p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Planning du jour</p>
                    <div className="space-y-2">
                      {[
                        { name: "CrossFit — Coach Yassine", time: "18:00", full: false },
                        { name: "Yoga Flow — Coach Sarra", time: "19:00", full: true },
                      ].map((s) => (
                        <div key={s.name} className="flex items-center justify-between rounded-lg bg-card px-3 py-2 text-xs">
                          <span className="font-semibold text-primary">{s.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              s.full
                                ? "bg-[color:var(--mono-ink)] text-[color:var(--mono-paper)]"
                                : "border border-[color:var(--mono-ink)] text-primary"
                            }`}
                          >
                            {s.time} {s.full ? "· Complet" : "· Places dispo"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Moving keyword strip */}
      <div
        className="mt-20 overflow-hidden border-y-2 border-[color:var(--mono-ink)] bg-[color:var(--mono-ink)] py-3.5 text-[color:var(--mono-paper)]"
        aria-hidden="true"
      >
        <div className="mono-marquee">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center">
              {MARQUEE.map((word) => (
                <span key={`${copy}-${word}`} className="flex items-center whitespace-nowrap text-sm font-extrabold uppercase tracking-[0.28em]">
                  <span className="px-7">{word}</span>
                  <span className="opacity-40">/</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
