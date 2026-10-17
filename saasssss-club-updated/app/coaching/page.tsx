"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Dumbbell, Loader2 } from "lucide-react";
import Image from "next/image";
import PagePublishGate from "@/components/layout/PagePublishGate";
import { useEditableContent } from "@/hooks/useEditableContent";
import { useAuth } from "@/context/AuthContext";

const ACTIVITY_LABELS: Record<string, string> = {
  BODYBUILDING: "Musculation", FITNESS: "Fitness", CARDIO: "Cardio", CROSSFIT: "CrossFit", YOGA: "Yoga", PILATES: "Pilates", BOXE: "Boxe", MMA: "MMA", AQUAGYM: "Aquagym", PADEL: "Padel", ZUMBA: "Zumba", SPINNING: "Spinning",
};
interface RealCoach { id: string; name: string; bio: string | null; photoUrl: string | null; specialties: string[]; activities: string[]; }

function TeamCoachCard({ coach, isDarkMode, delay }: { coach: RealCoach; isDarkMode: boolean; delay: number }) {
  return <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay }} className={`rounded-2xl overflow-hidden shadow-lg ${isDarkMode ? "bg-neutral-900" : "bg-white"}`}><div className="relative h-56">{coach.photoUrl ? <Image src={coach.photoUrl} alt={coach.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" /> : <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-neutral-800" : "bg-gray-100"}`}><Dumbbell size={36} className={isDarkMode ? "text-neutral-600" : "text-gray-300"} /></div>}</div><div className="p-6"><h3 className={`text-xl font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>{coach.name}</h3>{(coach.specialties.length > 0 || coach.activities.length > 0) && <p className="text-sm font-medium text-emerald-600 mb-2">{coach.specialties.length > 0 ? coach.specialties.join(" · ") : coach.activities.map((a) => ACTIVITY_LABELS[a] ?? a).join(" · ")}</p>}{coach.bio && <p className={`text-sm leading-relaxed ${isDarkMode ? "text-neutral-400" : "text-gray-600"}`}>{coach.bio}</p>}</div></motion.div>;
}
function CoachCard({ image, title, text, isDarkMode, delay }: { image: string; title: string; text: string; isDarkMode: boolean; delay: number }) {
  return <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay }} className={`rounded-2xl overflow-hidden shadow-lg ${isDarkMode ? "bg-neutral-900" : "bg-white"}`}><div className="relative h-48">{image ? <Image src={image} alt={title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" /> : <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-neutral-800" : "bg-gray-100"}`}><Dumbbell size={36} className={isDarkMode ? "text-neutral-600" : "text-gray-300"} /></div>}</div><div className="p-6"><h3 className={`text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>{title}</h3><p className={`text-sm leading-relaxed ${isDarkMode ? "text-neutral-400" : "text-gray-600"}`}>{text}</p></div></motion.div>;
}

export default function CoachingPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [coaches, setCoaches] = useState<RealCoach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(true);
  const { t, img } = useEditableContent("coaching");
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const heroImage = img("heroImage", "");

  useEffect(() => {
    const sync = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const res = await fetch("/api/coaches/public", { cache: "no-store" }); const data = await res.json(); if (!cancelled) setCoaches(Array.isArray(data.coaches) ? data.coaches : []); }
      catch { /* public page remains usable */ }
      finally { if (!cancelled) setLoadingCoaches(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    { image: img("card1Image", ""), title: t("card1Title", "Coaching individuel"), text: t("card1Text", "Un programme 100% personnalisé, un suivi hebdomadaire et un coach dédié à vos objectifs.") },
    { image: img("card2Image", ""), title: t("card2Title", "Coaching en petit groupe"), text: t("card2Text", "L'énergie du collectif, l'attention en plus — des séances en groupes de 4 à 6 personnes maximum.") },
    { image: img("card3Image", ""), title: t("card3Title", "Préparation sportive"), text: t("card3Text", "Une préparation physique ciblée pour la compétition, la remise en forme ou un objectif précis.") },
  ];

  const reservationHref = isLoggedIn ? "/dashboard/schedule" : "/user/login?redirect=/dashboard/schedule";

  return <PagePublishGate pageKey="coaching"><div className={`min-h-screen transition-all duration-300 ${isDarkMode ? "bg-neutral-950" : "bg-gradient-to-b from-gray-50 to-white"}`}>
    <section className={`relative py-16 text-center ${heroImage ? "overflow-hidden" : ""}`}>{heroImage && <><Image src={heroImage} alt="" fill priority sizes="100vw" className="object-cover" /><div className="absolute inset-0 bg-black/55" /></>}<div className="relative container mx-auto px-4"><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}><h1 className={`text-5xl md:text-6xl font-bold mb-5 ${heroImage ? "text-white" : isDarkMode ? "text-white" : "text-gray-900"}`}>{t("heroTitle", "Un coaching sur-mesure")}</h1><p className={`text-xl max-w-2xl mx-auto leading-relaxed ${heroImage ? "text-white/90" : isDarkMode ? "text-neutral-400" : "text-gray-600"}`}>{t("heroSubtitle", "Nos coachs certifiés vous accompagnent vers vos objectifs, à votre rythme, avec un suivi personnalisé.")}</p></motion.div></div></section>
    <section className="py-12"><div className="container mx-auto px-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-8">{cards.map((c, i) => <CoachCard key={i} {...c} isDarkMode={isDarkMode} delay={i * 0.1} />)}</div>
      {!loadingCoaches && coaches.length > 0 && <div className="mt-16"><h2 className={`text-2xl font-bold text-center mb-8 ${isDarkMode ? "text-white" : "text-gray-900"}`}>{t("teamTitle", "Notre équipe de coachs")}</h2><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">{coaches.map((coach, i) => <TeamCoachCard key={coach.id} coach={coach} isDarkMode={isDarkMode} delay={i * 0.1} />)}</div></div>}
      {loadingCoaches && <div className="flex justify-center mt-16"><Loader2 size={28} className="animate-spin text-emerald-600" /></div>}
      <div className="text-center mt-12"><a href={authLoading ? "#" : reservationHref} aria-disabled={authLoading} onClick={(e) => { if (authLoading) e.preventDefault(); }} className="inline-block bg-emerald-600 hover:bg-emerald-700 text-[var(--brand-contrast)] px-8 py-3 rounded-full font-bold transition transform hover:scale-105 shadow-lg">{t("ctaLabel", "Réserver une séance découverte")}</a></div>
    </div></section>
  </div></PagePublishGate>;
}
