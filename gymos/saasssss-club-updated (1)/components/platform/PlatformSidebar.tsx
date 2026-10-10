"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, Tag, ScrollText, Activity,
  LogOut, Home, ShieldCheck, Sparkles, Palette, Globe,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { name: "Vue d'ensemble", href: "/platform", icon: LayoutDashboard },
  { name: "Clubs", href: "/platform/clubs", icon: Building2 },
  { name: "Demandes de site", href: "/platform/website-requests", icon: Palette },
  { name: "Services & domaines", href: "/platform/service-requests", icon: Globe },
  { name: "Plans SaaS", href: "/platform/plans", icon: Tag },
  { name: "Journal d'activité", href: "/platform/logs", icon: ScrollText },
  { name: "Système", href: "/platform/system", icon: Activity },
];

function isActive(pathname: string, href: string) {
  return href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);
}

interface Props {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function PlatformSidebar({ mobileOpen, onClose }: Props) {
  const pathname = usePathname();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    onClose?.();
    window.location.href = "/";
  };

  const content = (
    <div className="flex h-full flex-col bg-slate-50/80 dark:bg-[#090d16]/90 backdrop-blur-xl">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 p-5 dark:border-slate-800/80">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-slate-900 text-emerald-400">
          <ShieldCheck size={18} />
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs font-black tracking-tight text-slate-900 dark:text-slate-100">
            Plateforme <Sparkles size={11} className="text-emerald-400" />
          </p>
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Contrôle SaaS</p>
        </div>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-500">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} />
            <span className="text-[11px] font-extrabold uppercase tracking-wider">SUPER ADMIN</span>
          </div>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs transition-all duration-200 ${
                active
                  ? "bg-emerald-500 font-extrabold text-slate-950 shadow-md shadow-emerald-500/20"
                  : "font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
              }`}
            >
              <item.icon size={17} className={active ? "text-slate-950" : "text-slate-400"} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-shrink-0 space-y-1 border-t border-slate-200 p-3 dark:border-slate-800/80">
        <Link
          href="/"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
        >
          <Home size={16} className="text-slate-400" />
          Retour au site
        </Link>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-500/10"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 flex-col border-r border-slate-200 shadow-xl dark:border-slate-800/80 lg:flex">
        {content}
      </aside>
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 animate-fade-in bg-slate-950/70 backdrop-blur-xs lg:hidden" onClick={onClose} />
          <aside className="fixed left-0 top-0 z-50 h-full w-72 animate-slide-in border-r border-slate-200 shadow-2xl dark:border-slate-800 lg:hidden">
            {content}
          </aside>
        </>
      )}
    </>
  );
}
