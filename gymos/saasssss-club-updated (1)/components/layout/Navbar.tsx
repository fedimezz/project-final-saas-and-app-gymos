"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  Dumbbell,
  LogOut,
  Calendar,
  LayoutDashboard,
  Sun,
  Moon,
  UserCircle,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useClubSettings, type PageKey } from "@/context/ClubSettingsContext";
import { useLanguage } from "@/context/LanguageContext";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { ClubLogo } from "@/components/ClubLogo";

const NAV_KEYS: Record<PageKey | "home", string> = {
  home: "navHome",
  coaching: "navCoaching",
  offres: "navOffers",
  actualites: "navNews",
  gallery: "navGallery",
};

const navigationItems: { name: string; href: string; key: PageKey | "home" }[] = [
  { name: "Le Club", href: "/", key: "home" },
  { name: "Coaching", href: "/coaching", key: "coaching" },
  { name: "Offres", href: "/offres", key: "offres" },
  { name: "Actualités", href: "/actualites", key: "actualites" },
  { name: "Galerie", href: "/gallery", key: "gallery" },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showDashboardMenu, setShowDashboardMenu] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const { isLoggedIn, userRole, user, logout } = useAuth();
  // user.avatar comes through StoredUser's `[key: string]: unknown` index
  // signature, so it's typed unknown rather than string — narrow it once
  // here instead of casting to `any` at each usage site.
  const userAvatar = typeof user?.avatar === "string" ? user.avatar : null;
  const { name: clubName, logoUrl, isPageEnabled, hasTenant } = useClubSettings();
  const { t } = useLanguage();
  const [nameFirst, ...nameRest] = clubName.split(" ");
  const nameSecondLine = nameRest.join(" ");
  const visibleNavItems = navigationItems.filter(
    (item) => item.key === "home" || isPageEnabled(item.key)
  );

  // No resolved gym tenant (apex/platform host) — this is the SaaS
  // marketing site itself, not any one gym's page. Render the dedicated
  // SaaS navbar instead of the per-gym one below. All hooks above still
  // run unconditionally, so this early return is safe.
  const showLandingNav = !hasTenant;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dashboard-menu-dropdown")) {
        setShowDashboardMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
    setIsOpen(false);
    setShowDashboardMenu(false);
  };

  const isAdmin = userRole?.toUpperCase() === "ADMIN" || userRole?.toUpperCase() === "OWNER";
  const isOnAdminPage = pathname?.startsWith("/admin");

  if (showLandingNav) {
    return <LandingNavbar />;
  }

  return (
    <>
      <nav
        className={`fixed top-0 z-50 w-full transition-all duration-500 ${
          scrolled
            ? isDark
              ? "bg-[#090d16]/85 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl py-3"
              : "bg-white/85 backdrop-blur-xl border-b border-slate-200/80 shadow-lg py-3"
            : isDark
            ? "bg-transparent py-5"
            : "bg-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between">
            {/* Brand Logo & Name */}
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="relative flex items-center justify-center">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 opacity-30 blur group-hover:opacity-75 transition duration-300" />
                <ClubLogo logoUrl={logoUrl} clubName={clubName} size="md" className="relative group-hover:scale-105 transition-transform duration-300" />
              </div>
              <div>
                <h1 className={`text-lg font-black tracking-tight flex items-center gap-1.5 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                  {nameSecondLine ? nameFirst : clubName}
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400 opacity-80" />
                </h1>
                {nameSecondLine && (
                  <p className={`text-[10px] uppercase tracking-widest font-semibold ${isDark ? "text-emerald-400/80" : "text-slate-500"}`}>
                    {nameSecondLine}
                  </p>
                )}
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-1 bg-slate-100/70 dark:bg-slate-900/60 p-1.5 rounded-full border border-slate-200/60 dark:border-slate-800/80 backdrop-blur-md">
              {visibleNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`relative px-4 py-1.5 text-xs font-semibold tracking-wide rounded-full transition-all duration-300 ${
                      isActive
                        ? "bg-slate-900 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-md"
                        : isDark
                        ? "text-slate-300 hover:text-white hover:bg-slate-800/50"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/80"
                    }`}
                  >
                    {t(NAV_KEYS[item.key], item.name)}
                  </Link>
                );
              })}
            </div>

            {/* Right Controls */}
            <div className="hidden lg:flex items-center space-x-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className={`p-2.5 rounded-full transition-all duration-300 border ${
                  isDark
                    ? "bg-slate-900/80 text-amber-400 border-slate-800 hover:border-amber-400/40 hover:bg-slate-800"
                    : "bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white"
                }`}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {isLoggedIn ? (
                <div className="flex items-center space-x-3">
                  {isAdmin ? (
                    <div className="relative dashboard-menu-dropdown">
                      <button
                        onClick={() => setShowDashboardMenu(!showDashboardMenu)}
                        className={`flex items-center space-x-2.5 text-xs font-bold pl-2 pr-3 py-1.5 rounded-full border transition-all duration-300 ${
                          isOnAdminPage
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                            : isDark
                            ? "bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700"
                            : "bg-slate-100 border-slate-200 text-slate-800 hover:bg-white"
                        }`}
                      >
                        {userAvatar ? (
                          <Image src={userAvatar} alt={user?.name || "Admin"} width={28} height={28} className="h-7 w-7 rounded-full object-cover border border-emerald-400/50 flex-shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold text-xs flex-shrink-0 shadow-sm">
                            {user?.name ? user.name.charAt(0).toUpperCase() : "A"}
                          </div>
                        )}
                        <span>{user?.name || t("navAdmin", "Admin")}</span>
                        <ChevronDown className={`h-3 w-3 transition-transform duration-300 ${showDashboardMenu ? "rotate-180" : ""}`} />
                      </button>

                      {showDashboardMenu && (
                        <div className={`absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl border p-1.5 transition-all animate-fade-in ${
                          isDark
                            ? "bg-slate-900/95 backdrop-blur-xl border-slate-800 text-slate-200"
                            : "bg-white/95 backdrop-blur-xl border-slate-200 text-slate-800"
                        }`}>
                          <Link
                            href="/admin"
                            onClick={() => setShowDashboardMenu(false)}
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                              isOnAdminPage
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
                            }`}
                          >
                            <LayoutDashboard className="h-4 w-4 text-emerald-500" />
                            {t("navDashboard", "Tableau de bord")}
                          </Link>
                          <Link
                            href="/admin/profile"
                            onClick={() => setShowDashboardMenu(false)}
                            className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                              pathname?.startsWith("/admin/profile")
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800/70"
                            }`}
                          >
                            <UserCircle className="h-4 w-4 text-emerald-500" />
                            {t("navProfile", "Mon profil")}
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link href="/dashboard">
                      <button
                        className={`flex items-center space-x-2.5 text-xs font-bold pl-2 pr-3 py-1.5 rounded-full border transition-all duration-300 ${
                          isDark
                            ? "bg-slate-900/80 border-slate-800 text-slate-200 hover:border-slate-700"
                            : "bg-slate-100 border-slate-200 text-slate-800 hover:bg-white"
                        }`}
                      >
                        {userAvatar ? (
                          <Image src={userAvatar} alt={user?.name || "User"} width={28} height={28} className="h-7 w-7 rounded-full object-cover border border-emerald-400/50 flex-shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold text-xs flex-shrink-0 shadow-sm">
                            {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
                          </div>
                        )}
                        <span>{user?.name || t("navDashboard", "Dashboard")}</span>
                      </button>
                    </Link>
                  )}

                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-2 text-xs font-semibold px-3.5 py-2.5 rounded-full text-rose-500 hover:bg-rose-500/10 transition duration-300"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{t("navLogout", "Logout")}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Link href="/user/login">
                    <button
                      className={`text-xs font-bold px-4 py-2.5 rounded-full transition-all duration-300 ${
                        isDark ? "text-slate-200 hover:text-white hover:bg-slate-900" : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {t("navLogin", "Login")}
                    </button>
                  </Link>
                  <Link href="/user/register">
                    <button className="relative group overflow-hidden bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2.5 rounded-full text-xs font-extrabold tracking-wide transition duration-300 shadow-lg shadow-emerald-500/25 active:scale-95">
                      <span className="relative z-10">{t("navJoin", "Join Now")}</span>
                    </button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex items-center space-x-2 lg:hidden">
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-full border ${isDark ? "bg-slate-900 border-slate-800 text-amber-400" : "bg-slate-100 border-slate-200 text-slate-700"}`}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2.5 rounded-full border ${isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-100 border-slate-200 text-slate-800"}`}
              >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden animate-fade-in">
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className={`fixed right-0 top-0 h-full w-72 shadow-2xl p-6 border-l backdrop-blur-2xl ${
            isDark ? "bg-[#090d16]/95 border-slate-800 text-slate-100" : "bg-white/95 border-slate-200 text-slate-900"
          }`}>
            <div className="flex flex-col space-y-4 mt-12">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`text-sm font-semibold py-2 px-3 rounded-xl transition ${
                    pathname === item.href
                      ? "bg-emerald-500/10 text-emerald-500 font-bold"
                      : isDark ? "text-slate-300 hover:bg-slate-800/50" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {t(NAV_KEYS[item.key], item.name)}
                </Link>
              ))}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                {isLoggedIn ? (
                  <>
                    {isAdmin ? (
                      <>
                        <Link
                          href="/admin"
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-2 text-xs font-bold py-2.5 px-3 rounded-xl bg-emerald-500/10 text-emerald-400"
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          {t("navDashboard", "Tableau de bord admin")}
                        </Link>
                        <Link
                          href="/admin/profile"
                          onClick={() => setIsOpen(false)}
                          className="flex items-center gap-2 text-xs font-bold py-2.5 px-3 rounded-xl hover:bg-slate-800/50"
                        >
                          <UserCircle className="h-4 w-4 text-emerald-500" />
                          {t("navProfile", "Mon profil")}
                        </Link>
                      </>
                    ) : (
                      <Link
                        href="/dashboard"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-2 text-xs font-bold py-2.5 px-3 rounded-xl bg-emerald-500/10 text-emerald-400"
                      >
                        <Calendar className="h-4 w-4" />
                        Dashboard
                      </Link>
                    )}
                    <button onClick={handleLogout} className="w-full text-left text-xs font-bold text-rose-500 py-2.5 px-3 rounded-xl hover:bg-rose-500/10">
                      Logout
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col space-y-2 pt-2">
                    <Link href="/user/login" onClick={() => setIsOpen(false)}>
                      <button className="w-full text-center text-xs font-bold py-2.5 rounded-full border border-slate-700">
                        {t("navLogin", "Login")}
                      </button>
                    </Link>
                    <Link href="/user/register" onClick={() => setIsOpen(false)}>
                      <button className="w-full text-center text-xs font-extrabold py-2.5 rounded-full bg-emerald-500 text-slate-950 shadow-md">
                        {t("navJoin", "Join Now")}
                      </button>
                    </Link>
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
