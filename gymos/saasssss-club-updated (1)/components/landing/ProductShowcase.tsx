"use client";

import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Users, TrendingUp, CalendarDays, Dumbbell, BarChart3,
  MoreHorizontal, Search,
} from "lucide-react";
import StatCard from "@/components/admin/StatCard";

const TABS = [
  { key: "owner", label: "Tableau de bord propriétaire" },
  { key: "member", label: "Espace membre" },
  { key: "schedule", label: "Planning" },
  { key: "members", label: "Gestion des membres" },
  { key: "revenue", label: "Revenus & analytique" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function OwnerPanel() {
  return (
    <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
      <StatCard title="Membres" value="482" icon={Users} color="green" trend={{ value: "+12%", up: true }} />
      <StatCard title="Revenu (mois)" value="14 250 DT" icon={TrendingUp} color="blue" trend={{ value: "+8%", up: true }} />
      <StatCard title="Sessions/sem." value="96" icon={CalendarDays} color="purple" />
      <StatCard title="Taux de présence" value="87%" icon={BarChart3} color="amber" />
    </div>
  );
}

function MemberPanel() {
  return (
    <div className="p-5">
      <div className="rounded-xl border border-border bg-muted/60 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Prochaine session</p>
        <p className="mt-1 text-sm font-black text-primary">CrossFit — 18h00 avec Coach Yassine</p>
        <button className="mt-3 rounded-full bg-emerald-500 px-4 py-1.5 text-[11px] font-extrabold text-slate-950">
          Voir mon planning
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard title="Sessions ce mois" value="14" icon={Dumbbell} color="green" />
        <StatCard title="Abonnement" value="Actif" icon={Users} color="blue" />
      </div>
    </div>
  );
}

function SchedulePanel() {
  const rows = [
    { activity: "CrossFit", coach: "Yassine", time: "07:00 – 08:00", spots: "12/15" },
    { activity: "Yoga Flow", coach: "Sarra", time: "09:00 – 10:00", spots: "20/20" },
    { activity: "Padel", coach: "Karim", time: "18:00 – 19:00", spots: "4/8" },
  ];
  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/70 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
              <th className="px-3 py-2">Activité</th>
              <th className="px-3 py-2">Coach</th>
              <th className="px-3 py-2">Horaire</th>
              <th className="px-3 py-2">Places</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.activity} className="border-t border-border">
                <td className="px-3 py-2.5 font-bold text-primary">{r.activity}</td>
                <td className="px-3 py-2.5 text-secondary">{r.coach}</td>
                <td className="px-3 py-2.5 text-secondary">{r.time}</td>
                <td className="px-3 py-2.5 text-secondary">{r.spots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MembersPanel() {
  const rows = [
    { name: "Amira B.", plan: "Premium", status: "Actif" },
    { name: "Yassine K.", plan: "Standard", status: "Actif" },
    { name: "Nour T.", plan: "Standard", status: "En attente" },
  ];
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3.5 py-2 text-xs text-muted">
        <Search className="h-3.5 w-3.5" />
        Rechercher un membre…
      </div>
      <div className="space-y-2">
        {rows.map((m) => (
          <div key={m.name} className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-xs font-extrabold text-slate-950">
                {m.name.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-bold text-primary">{m.name}</p>
                <p className="text-[10px] text-muted">{m.plan}</p>
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              m.status === "Actif" ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
            }`}>
              {m.status}
            </span>
            <MoreHorizontal className="h-4 w-4 text-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenuePanel() {
  const bars = [40, 55, 48, 70, 65, 82];
  return (
    <div className="p-5">
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard title="Revenu total" value="14 250 DT" icon={TrendingUp} color="blue" trend={{ value: "+8%", up: true }} />
        <StatCard title="Nouveaux membres" value="+37" icon={Users} color="green" trend={{ value: "+5%", up: true }} />
      </div>
      <div className="rounded-xl border border-border bg-muted/60 p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-muted">Revenu — 6 derniers mois</p>
        <div className="flex h-24 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-md bg-emerald-500/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<TabKey, () => React.ReactElement> = {
  owner: OwnerPanel,
  member: MemberPanel,
  schedule: SchedulePanel,
  members: MembersPanel,
  revenue: RevenuePanel,
};

export default function ProductShowcase() {
  const [active, setActive] = useState<TabKey>("owner");
  const reduceMotion = useReducedMotion();
  const ActivePanel = PANELS[active];

  return (
    <section id="product-showcase" className="section-padding scroll-mt-24 bg-muted/40">
      <div className="container-custom">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Aperçu produit</span>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
            Une plateforme. Tout votre club.
          </h2>
        </div>

        {/* Tabs */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ${
                active === tab.key
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25"
                  : "border border-border bg-card text-secondary hover:border-[var(--primary)]/30"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Browser mockup */}
        <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <div className="ml-3 flex-1 truncate rounded-full bg-card px-3 py-1 text-[10px] font-medium text-muted">
              votregym.gymos.app/{active === "owner" ? "admin" : "dashboard"}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <ActivePanel />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
