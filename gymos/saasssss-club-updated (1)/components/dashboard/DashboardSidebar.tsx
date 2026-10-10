// src/components/dashboard/DashboardSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardLinks, coachLinks, isLinkActive } from "@/lib/navigation";
import { useAuth } from "@/context/AuthContext";
import { Shield, Home, LogOut } from "lucide-react";

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { userRole, logout } = useAuth();

  const roleUpper = userRole?.toUpperCase();
  const isAdmin = roleUpper === "ADMIN" || roleUpper === "OWNER";
  const isCoach = roleUpper === "COACH";
  const links = isCoach ? coachLinks : dashboardLinks;

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-72 bg-card border-r border-border z-20 flex-col overflow-hidden">
      {/* Logo */}
      <div className="p-6 border-b border-border flex-shrink-0">
        <h2 className="text-2xl font-bold text-primary">Le Club</h2>
        <p className="text-xs text-muted -mt-1">de Gammarth</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--primary)] uppercase bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
            {isCoach ? "Coach" : "Membre"}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isLinkActive(pathname, link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                ${
                  active
                    ? "bg-nav-active text-white shadow-md"
                    : "text-muted hover:bg-muted hover:text-primary"
                }
              `}
            >
              <Icon
                size={20}
                className={`flex-shrink-0 transition-colors ${
                  active ? "text-white" : "text-muted group-hover:text-primary"
                }`}
              />
              <span className="font-medium">{link.name}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 animate-pulse" />
              )}
            </Link>
          );
        })}

        {/* Admin Dashboard Link - Only visible to admins */}
        {isAdmin && (
          <>
            <div className="my-4 border-t border-border" />
            <Link
              href="/admin"
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                bg-[var(--primary)]/5 text-[var(--primary)] hover:bg-[var(--primary)]/15 border border-[var(--primary)]/20
              `}
            >
              <Shield size={20} className="flex-shrink-0 text-[var(--primary)]" />
              <span className="font-medium">Admin Dashboard</span>
              <span className="ml-auto text-xs bg-[var(--primary)]/10 px-2 py-0.5 rounded-full">
                Admin
              </span>
            </Link>
          </>
        )}

        {/* Home Link */}
        <div className="my-4 border-t border-border" />
        <Link
          href="/"
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
            text-muted hover:bg-muted hover:text-primary
          `}
        >
          <Home size={20} className="flex-shrink-0 text-muted group-hover:text-primary" />
          <span className="font-medium">Accueil du site</span>
        </Link>
      </nav>

      {/* Footer - Logout */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-danger hover:bg-danger/10 transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
