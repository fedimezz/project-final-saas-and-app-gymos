"use client";

import { usePathname } from "next/navigation";
import { Menu, ShieldCheck, Sun, Moon } from "lucide-react";
import { platformLinks } from "@/lib/navigation";
import { useTheme } from "@/context/ThemeContext";

export default function PlatformHeader({ onMobileMenu }: { onMobileMenu: () => void }) {
  const pathname = usePathname();
  const { isDark, toggleTheme } = useTheme();

  const current = platformLinks.find((l) =>
    l.href === "/platform" ? pathname === "/platform" : pathname.startsWith(l.href)
  );

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card px-6">
      <button onClick={onMobileMenu} className="rounded-lg p-2 transition-colors hover:bg-muted lg:hidden" aria-label="Menu">
        <Menu size={20} className="text-primary" />
      </button>

      <div className="flex-1">
        <p className="text-sm text-muted">Plateforme</p>
        <h2 className="text-base font-semibold leading-none text-primary">{current?.name ?? "Vue d'ensemble"}</h2>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={toggleTheme} className="rounded-lg p-2 transition-colors hover:bg-muted" aria-label="Basculer le thème">
          {isDark ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-primary" />}
        </button>
        <div className="flex items-center gap-2 rounded-xl bg-[var(--primary)]/10 px-3 py-1.5">
          <ShieldCheck size={14} className="text-[var(--primary)]" />
          <span className="text-xs font-semibold text-[var(--primary)]">SUPER_ADMIN</span>
        </div>
      </div>
    </header>
  );
}
