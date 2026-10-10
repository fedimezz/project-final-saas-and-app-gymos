"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Palette, Image as ImageIcon, Type, ToggleLeft } from "lucide-react";

const CUSTOMIZABLE = [
  "Nom du club",
  "Logo",
  "Couleur de marque",
  "Photos & contenu",
  "Pages activées",
  "Paramètres du club",
];

export default function CustomizationSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-padding">
      <div className="container-custom">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          {/* Settings preview mockup */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="order-2 lg:order-1"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              <div className="border-b border-border px-5 py-4">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Identité du club</p>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary">Logo du club</p>
                    <p className="text-[10px] text-muted">PNG, SVG — 512×512px</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <Palette className="h-3.5 w-3.5" /> Couleur de marque
                  </div>
                  <div className="flex gap-2">
                    {["#10b981", "#38bdf8", "#f59e0b", "#f43f5e", "#8b5cf6"].map((c) => (
                      <span key={c} className="h-7 w-7 rounded-full border-2 border-card shadow-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/60 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    <Type className="h-3.5 w-3.5" /> Titre d&apos;accueil
                  </div>
                  <div className="h-8 rounded-lg border border-border bg-card px-3 text-xs leading-8 text-secondary">
                    Bienvenue chez Fitness Elite
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/60 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <ToggleLeft className="h-4 w-4 text-emerald-500" /> Page Galerie
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">Activée</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Copy */}
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="order-1 lg:order-2"
          >
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-500">Personnalisation</span>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-primary sm:text-4xl">
              Faites de la plateforme la vôtre.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-secondary sm:text-base">
              Les propriétaires de salle peuvent personnaliser l&apos;identité de leur club — nom,
              logo, couleurs, contenu, pages publiques et paramètres — sans écrire une ligne de code.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-3">
              {CUSTOMIZABLE.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs font-bold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
