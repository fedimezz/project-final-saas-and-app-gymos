"use client";

// LandingNavbar — marketing navbar sur le domaine apex seulement (pas sur les sous-domaines club).
// 2 CTAs distincts : "Se connecter" → /platform/login (owners)
//                   "Créer mon gym" → /onboarding (nouveaux owners)
// Les membres d'un club n'ont rien à faire ici — ils passent par leur sous-domaine.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Sun, Moon, Sparkles } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

const NAV_LINKS = [
  { name: "Fonctionnalités", href: "#features" },
  { name: "Solutions",       href: "#multi-tenant" },
  { name: "Tarifs",          href: "#pricing" },
  { name: "FAQ",             href: "#faq" },
];

export default function LandingNavbar() {
  const [isOpen, setIsOpen]   = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname              = usePathname();
  const { isDark, toggleTheme } = useTheme();
  const { isLoggedIn, userRole } = useAuth();

  const isAdmin       = userRole?.toUpperCase() === "ADMIN" || userRole?.toUpperCase() === "OWNER";
  const dashboardHref = isAdmin ? "/admin" : "/dashboard";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  return (
      <>
        <nav
            className={`fixed top-0 z-50 w-full transition-all duration-500 ${
                scrolled
                    ? isDark
                        ? "bg-[#090d16]/85 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl py-3"
                        : "bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-lg py-3"
                    : "bg-transparent py-5"
            }`}
        >
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex items-center justify-between">

              {/* Brand */}
              <Link href="/" className="flex items-center space-x-3 group">
                <div className="relative flex items-center justify-center">
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-emerald-500 to-sky-400 opacity-30 blur group-hover:opacity-75 transition duration-300" />
                  <div className="relative h-9 w-9 rounded-xl bg-slate-900 dark:bg-emerald-950 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                    <LayoutDashboard className="h-4.5 w-4.5" />
                  </div>
                </div>
                <div>
                  <h1 className={`text-lg font-black tracking-tight flex items-center gap-1.5 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    GymOS
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400 opacity-80" />
                  </h1>
                  <p className={`text-[10px] uppercase tracking-widest font-semibold ${isDark ? "text-emerald-400/80" : "text-slate-500"}`}>
                    Gym Management SaaS
                  </p>
                </div>
              </Link>

              {/* Desktop nav links */}
              <div className="hidden lg:flex items-center space-x-1 bg-slate-100/70 dark:bg-slate-900/60 p-1.5 rounded-full border border-slate-200/60 dark:border-slate-800/80 backdrop-blur-md">
                {NAV_LINKS.map((item) => (
                    <a
                        key={item.name}
                        href={item.href}
                        className={`px-4 py-1.5 text-xs font-semibold tracking-wide rounded-full transition-all duration-300 ${
                            isDark
                                ? "text-slate-300 hover:text-white hover:bg-slate-800/50"
                                : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                        }`}
                    >
                      {item.name}
                    </a>
                ))}
              </div>

              {/* Desktop CTAs */}
              <div className="hidden lg:flex items-center space-x-3">
                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    aria-label="Changer de thème"
                    className={`p-2.5 rounded-full transition-all duration-300 border ${
                        isDark
                            ? "bg-slate-900/80 text-amber-400 border-slate-800 hover:border-amber-400/40 hover:bg-slate-800"
                            : "bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white"
                    }`}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>

                {isLoggedIn ? (
                    /* Already logged in as owner → go to dashboard */
                    <Link href={dashboardHref}>
                      <button className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 transition duration-300 active:scale-95">
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        Mon espace
                      </button>
                    </Link>
                ) : (
                    <div className="flex items-center space-x-2">
                      {/* Owner login */}
                      <Link href="/platform/login">
                        <button
                            className={`text-xs font-bold px-4 py-2.5 rounded-full transition-all duration-300 ${
                                isDark
                                    ? "text-slate-200 hover:text-white hover:bg-slate-900"
                                    : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                            }`}
                        >
                          Connexion propriétaire
                        </button>
                      </Link>
                      {/* Create a new club */}
                      <Link href="/onboarding">
                        <button className="relative overflow-hidden bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2.5 rounded-full text-xs font-extrabold tracking-wide transition duration-300 shadow-lg shadow-emerald-500/25 active:scale-95">
                          Créer mon gym gratuit
                        </button>
                      </Link>
                    </div>
                )}
              </div>

              {/* Mobile toggle */}
              <div className="flex items-center space-x-2 lg:hidden">
                <button
                    onClick={toggleTheme}
                    aria-label="Changer de thème"
                    className={`p-2 rounded-full border ${isDark ? "bg-slate-900 border-slate-800 text-amber-400" : "bg-slate-100 border-slate-200 text-slate-700"}`}
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? "Fermer le menu" : "Ouvrir le menu"}
                    aria-expanded={isOpen}
                    className={`p-2.5 rounded-full border ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-800"}`}
                >
                  {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile drawer */}
        {isOpen && (
            <div className="fixed inset-0 z-40 lg:hidden animate-fade-in">
              <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
              <div
                  className={`fixed right-0 top-0 h-full w-72 shadow-2xl p-6 border-l backdrop-blur-2xl ${
                      isDark ? "bg-[#090d16]/95 border-slate-800 text-slate-100" : "bg-white/95 border-slate-200 text-slate-900"
                  }`}
              >
                <div className="flex flex-col space-y-4 mt-12">
                  {NAV_LINKS.map((item) => (
                      <a
                          key={item.name}
                          href={item.href}
                          onClick={() => setIsOpen(false)}
                          className={`text-sm font-semibold py-2 px-3 rounded-xl transition ${
                              isDark ? "text-slate-300 hover:bg-slate-800/50" : "text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        {item.name}
                      </a>
                  ))}

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    {isLoggedIn ? (
                        <Link href={dashboardHref} onClick={() => setIsOpen(false)}>
                          <button className="w-full flex items-center justify-center gap-2 text-xs font-extrabold py-2.5 rounded-full bg-emerald-500 text-slate-950 shadow-md">
                            <LayoutDashboard className="h-4 w-4" />
                            Mon espace
                          </button>
                        </Link>
                    ) : (
                        <div className="flex flex-col space-y-2 pt-2">
                          <Link href="/platform/login" onClick={() => setIsOpen(false)}>
                            <button className={`w-full text-center text-xs font-bold py-2.5 rounded-full border ${isDark ? "border-slate-700 text-slate-200" : "border-slate-300 text-slate-700"}`}>
                              Connexion propriétaire
                            </button>
                          </Link>
                          <Link href="/onboarding" onClick={() => setIsOpen(false)}>
                            <button className="w-full text-center text-xs font-extrabold py-2.5 rounded-full bg-emerald-500 text-slate-950 shadow-md">
                              Créer mon gym gratuit
                            </button>
                          </Link>
                          <div className={`pt-2 text-xs text-center ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            Membre d&apos;un club ? Connectez-vous via l&apos;adresse de votre club.
                          </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        )}

        <div className="h-16" />
      </>
  );
}